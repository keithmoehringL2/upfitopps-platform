import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  auditLog,
  company,
  distributor,
  importBatch,
  importChange,
  interaction,
  manufacturer,
  manufacturerProgram,
  programDistributor,
  session,
  user,
} from "./schema";
import { RESERVED_SUBDOMAINS } from "../tenancy/reserved-slugs";
import { parseCsv } from "../import/csv";
import {
  runDryRun,
  type DryRunContext,
  type ExistingCompany,
} from "../import/engine";
import type { AuthContext } from "../auth/context";
import { isManufacturerRole } from "../auth/context";
import { outcomeMeta, type OutcomeValue } from "../rep/outcomes";
import { sendWrongNumberAlert } from "../email/alerts";
import type { CompanyImport } from "../import/csv";
import {
  mergeSettings,
  type CadenceKey,
  type ManagerSettings,
} from "../manager/settings";

function requireManager(ctx: AuthContext): string {
  const distributorId = requireDistributorScope(ctx);
  if (ctx.role !== "manager") {
    throw new ForbiddenError("Managers only");
  }
  return distributorId;
}

/**
 * L2 admin gate. Unlike the distributor/manager guards, the admin is
 * deliberately CROSS-TENANT (it provisions and oversees every distributor), so
 * it has no distributor scope — each admin method is responsible for returning
 * only aggregate/administrative data, never rep-level prospect content.
 */
function requireAdmin(ctx: AuthContext): void {
  if (ctx.role !== "l2_admin") {
    throw new ForbiddenError("L2 admin only");
  }
}

/**
 * Manufacturer portal gate. Manufacturer users get an aggregate-only read model
 * scoped to their programs — never company records. Returns the scope keys.
 */
function requireManufacturer(ctx: AuthContext): {
  userId: string;
  manufacturerId: string;
  role: "mfr_regional" | "mfr_leadership";
} {
  if (ctx.role !== "mfr_regional" && ctx.role !== "mfr_leadership") {
    throw new ForbiddenError("Manufacturer portal only");
  }
  if (!ctx.manufacturerId) throw new ForbiddenError("No manufacturer in context");
  return { userId: ctx.userId, manufacturerId: ctx.manufacturerId, role: ctx.role };
}

/** Slug validation shared by the availability check and provisioning. */
export type SlugState = "ok" | "bad_format" | "reserved" | "taken";
function slugShapeOk(slug: string): boolean {
  return (
    slug.length >= 3 &&
    slug.length <= 30 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)
  );
}

/** Append an audit-log entry. High-impact admin writes go through here. */
async function writeAudit(
  db: ReturnType<typeof getDb>,
  entry: {
    distributorId?: string | null;
    actorUserId: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    distributorId: entry.distributorId ?? null,
    actorUserId: entry.actorUserId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
  });
}

/** Fetch the distributor's current data the import dry-run validates against. */
async function buildImportContext(distributorId: string): Promise<DryRunContext> {
  const db = getDb();
  const [existing, reps, progs] = await Promise.all([
    db
      .select({ id: company.id, ext: company.externalImportId, name: company.name, address: company.address, ownerUserId: company.ownerUserId, decisionMaker: company.decisionMaker, followUpDate: company.followUpDate })
      .from(company)
      .where(and(eq(company.distributorId, distributorId), isNotNull(company.externalImportId))),
    db
      .select({ email: user.email, id: user.id })
      .from(user)
      .where(and(eq(user.distributorId, distributorId), eq(user.role, "rep"), eq(user.status, "active"))),
    db
      .select({ code: manufacturerProgram.code, id: manufacturerProgram.id })
      .from(programDistributor)
      .innerJoin(manufacturerProgram, eq(programDistributor.programId, manufacturerProgram.id))
      .where(and(eq(programDistributor.distributorId, distributorId), isNotNull(manufacturerProgram.code))),
  ]);

  const existingByExtId = new Map<string, ExistingCompany>();
  const nameAddrToExtIds = new Map<string, string[]>();
  for (const c of existing) {
    const ext = c.ext as string;
    existingByExtId.set(ext, { id: c.id, name: c.name, address: c.address, ownerUserId: c.ownerUserId, hasDm: c.decisionMaker != null, hasFollowUp: c.followUpDate != null });
    const key = `${c.name.trim().toLowerCase()}|${(c.address ?? "").trim().toLowerCase()}`;
    nameAddrToExtIds.set(key, [...(nameAddrToExtIds.get(key) ?? []), ext]);
  }
  return {
    existingByExtId,
    nameAddrToExtIds,
    repEmailToId: new Map(reps.map((r) => [r.email.toLowerCase(), r.id])),
    programCodeToId: new Map(progs.filter((p) => p.code).map((p) => [p.code as string, p.id])),
  };
}

/** The company columns an import writes (and a rollback restores). */
function descriptiveFields(f: {
  name: string; address: string | null; city: string | null; state: string | null; zip: string | null;
  phone: string | null; website: string | null; industryPrimary: string | null; industrySub: string | null;
  totalVehicles: number | null; truckCount: number | null; vanCount: number | null; fleetMix: unknown;
  priorityScore: string | null; priorityExplanation: string | null; touchIntervalDays: number | null;
}) {
  return {
    name: f.name, address: f.address, city: f.city, state: f.state, zip: f.zip,
    phone: f.phone, website: f.website, industryPrimary: f.industryPrimary, industrySub: f.industrySub,
    totalVehicles: f.totalVehicles, truckCount: f.truckCount, vanCount: f.vanCount, fleetMix: f.fleetMix,
    priorityScore: f.priorityScore, priorityExplanation: f.priorityExplanation, touchIntervalDays: f.touchIntervalDays,
  };
}

// ── Manufacturer aggregate-only read model helpers ────────────────────────
// A recorded "attempt" is a call with a saved outcome (skips the data-quality
// wrong_number). "DM reached" is specifically a decision_maker outcome.
const MFR_ATTEMPT = new Set(["no_answer", "voicemail", "gatekeeper", "decision_maker"]);

type CohortCompany = {
  id: string;
  distributorId: string;
  sourceProgramId: string | null;
  industryPrimary: string | null;
  lifecycleState: string;
  hasDm: boolean;
  quoted: boolean;
  totalVehicles: number | null;
};
type CohortInteraction = { companyId: string; outcome: string; createdAt: Date };

/** The 7 program KPIs for a set of cohort companies + their interactions. */
function mfrMetrics(companies: CohortCompany[], ints: CohortInteraction[]) {
  const byCompany = new Map<string, CohortInteraction[]>();
  for (const i of ints) {
    const arr = byCompany.get(i.companyId) ?? [];
    arr.push(i);
    byCompany.set(i.companyId, arr);
  }
  const N = companies.length;
  const A = companies.filter((c) => (byCompany.get(c.id) ?? []).some((i) => MFR_ATTEMPT.has(i.outcome))).length;
  const E = ints.filter((i) => MFR_ATTEMPT.has(i.outcome)).length;
  const pdm = companies.filter((c) => c.hasDm).length;
  const dmr = companies.filter((c) => (byCompany.get(c.id) ?? []).some((i) => i.outcome === "decision_maker")).length;
  const opp = companies.filter((c) => c.lifecycleState === "opp").length;
  const q = companies.filter((c) => c.quoted).length;
  return { N, A, E, pdm, dmr, opp, q, mor: N ? A / N : 0 };
}

/** 12 weekly buckets ending today: weekly attempts + cumulative outreach rate. */
function mfrTrend(N: number, ints: CohortInteraction[]) {
  const now = Date.now();
  const WEEK = 7 * 86_400_000;
  const firstAttempt = new Map<string, number>();
  for (const i of ints) {
    if (!MFR_ATTEMPT.has(i.outcome)) continue;
    const t = new Date(i.createdAt).getTime();
    const prev = firstAttempt.get(i.companyId);
    if (prev == null || t < prev) firstAttempt.set(i.companyId, t);
  }
  const firsts = [...firstAttempt.values()];
  const series: { week: string; attempts: number; rate: number }[] = [];
  for (let k = 0; k < 12; k++) {
    const end = now - (11 - k) * WEEK;
    const start = end - WEEK;
    const attempts = ints.filter((i) => {
      if (!MFR_ATTEMPT.has(i.outcome)) return false;
      const t = new Date(i.createdAt).getTime();
      return t >= start && t < end;
    }).length;
    const reached = firsts.filter((t) => t <= end).length;
    series.push({
      week: new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      attempts,
      rate: N ? Math.round((reached / N) * 100) : 0,
    });
  }
  return series;
}

/** The program↔distributor rows a manufacturer user may see (regional = own
 *  assignments; leadership = all of the manufacturer's), optionally filtered to
 *  one regional rep. */
async function fetchMfrScope(ctx: AuthContext, repFilter?: string | null) {
  const { userId, manufacturerId, role } = requireManufacturer(ctx);
  const db = getDb();
  const rows = await db
    .select({
      pdId: programDistributor.id,
      programId: programDistributor.programId,
      distributorId: programDistributor.distributorId,
      cohort: programDistributor.cohort,
      regionalRepUserId: programDistributor.regionalRepUserId,
      pdCreatedAt: programDistributor.createdAt,
      distributorName: distributor.name,
      regionalRepName: user.name,
      regionalRepEmail: user.email,
    })
    .from(programDistributor)
    .innerJoin(manufacturerProgram, eq(programDistributor.programId, manufacturerProgram.id))
    .innerJoin(distributor, eq(programDistributor.distributorId, distributor.id))
    .leftJoin(user, eq(programDistributor.regionalRepUserId, user.id))
    .where(eq(manufacturerProgram.manufacturerId, manufacturerId));
  let scoped = role === "mfr_regional" ? rows.filter((r) => r.regionalRepUserId === userId) : rows;
  if (repFilter) scoped = scoped.filter((r) => r.regionalRepUserId === repFilter);
  return { role, manufacturerId, scoped };
}

/** Cohort companies (aggregate-only columns) + their interactions for a set of
 *  scoped program↔distributor rows. Never selects names/contacts/notes. */
async function fetchCohort(scoped: Awaited<ReturnType<typeof fetchMfrScope>>["scoped"]) {
  const db = getDb();
  const programIds = [...new Set(scoped.map((s) => s.programId))];
  const distributorIds = [...new Set(scoped.map((s) => s.distributorId))];
  const pairKey = new Set(scoped.map((s) => `${s.programId}|${s.distributorId}`));
  if (programIds.length === 0 || distributorIds.length === 0) {
    return { companies: [] as CohortCompany[], ints: [] as CohortInteraction[] };
  }
  const comps = await db
    .select({
      id: company.id,
      distributorId: company.distributorId,
      sourceProgramId: company.sourceProgramId,
      industryPrimary: company.industryPrimary,
      lifecycleState: company.lifecycleState,
      hasDm: sql<boolean>`${company.decisionMaker} is not null`,
      quoted: sql<boolean>`${company.quoteCount} > 0`,
      totalVehicles: company.totalVehicles,
    })
    .from(company)
    .where(and(inArray(company.sourceProgramId, programIds), inArray(company.distributorId, distributorIds)));
  const companies = comps.filter((c) => c.sourceProgramId && pairKey.has(`${c.sourceProgramId}|${c.distributorId}`));
  const ids = companies.map((c) => c.id);
  const ints = ids.length
    ? await db
        .select({ companyId: interaction.companyId, outcome: interaction.outcome, createdAt: interaction.createdAt })
        .from(interaction)
        .where(inArray(interaction.companyId, ids))
    : [];
  return { companies, ints };
}

/**
 * The ONLY sanctioned way to read or mutate tenant data.
 *
 * Every method takes an AuthContext and injects the tenant predicate into the
 * query itself (default-deny). There is deliberately no exported raw-query
 * helper — new code must go through here so a tenant scope can never be
 * forgotten. See BUILD_PLAN_architecture_and_security.md §7–§8.
 */

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}

function requireDistributorScope(ctx: AuthContext): string {
  if (isManufacturerRole(ctx.role)) {
    // Manufacturers get aggregate-only reporting from a separate read model and
    // must never reach company records.
    throw new ForbiddenError("Manufacturer users cannot read company records");
  }
  if (ctx.role === "l2_admin") {
    throw new ForbiddenError(
      "L2 admin must target a specific distributor explicitly",
    );
  }
  if (!ctx.distributorId) {
    throw new ForbiddenError("No distributor in auth context");
  }
  return ctx.distributorId;
}

/** Date helpers for the cadence engine (date-only columns, UTC day). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function addDaysFromISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export const data = {
  /** Lookup used by host routing to render a tenant's brand. */
  async getDistributorBySlug(slug: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(distributor)
      .where(eq(distributor.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  },

  async getDistributorById(id: string) {
    const db = getDb();
    const rows = await db
      .select()
      .from(distributor)
      .where(eq(distributor.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  // ───────────────────────── L2 Admin (cross-tenant) ───────────────────────

  /**
   * The Distributors list for the L2 admin portal: every distributor with its
   * company/rep counts, manager, programs and status. Cross-tenant and
   * admin-only; returns aggregate/administrative data, never prospect content.
   */
  async listDistributorsOverview(ctx: AuthContext) {
    requireAdmin(ctx);
    const db = getDb();
    const [dists, companyCounts, users, progs] = await Promise.all([
      db
        .select({
          id: distributor.id,
          name: distributor.name,
          slug: distributor.slug,
          primaryColor: distributor.primaryColor,
          status: distributor.status,
          createdAt: distributor.createdAt,
        })
        .from(distributor)
        .orderBy(distributor.name),
      db
        .select({ distributorId: company.distributorId, n: sql<number>`count(*)::int` })
        .from(company)
        .groupBy(company.distributorId),
      db
        .select({
          distributorId: user.distributorId,
          role: user.role,
          name: user.name,
          email: user.email,
        })
        .from(user)
        .where(and(inArray(user.role, ["manager", "rep"]), eq(user.status, "active"))),
      db
        .select({
          distributorId: programDistributor.distributorId,
          manufacturerName: manufacturer.name,
        })
        .from(programDistributor)
        .innerJoin(
          manufacturerProgram,
          eq(programDistributor.programId, manufacturerProgram.id),
        )
        .innerJoin(manufacturer, eq(manufacturerProgram.manufacturerId, manufacturer.id)),
    ]);

    const companyMap = new Map(companyCounts.map((c) => [c.distributorId, c.n]));
    return dists.map((d) => {
      const du = users.filter((u) => u.distributorId === d.id);
      const manager = du.find((u) => u.role === "manager");
      const programs = [
        ...new Set(
          progs.filter((p) => p.distributorId === d.id).map((p) => p.manufacturerName),
        ),
      ];
      return {
        id: d.id,
        name: d.name,
        slug: d.slug,
        primaryColor: d.primaryColor,
        status: d.status,
        createdAt: d.createdAt,
        companyCount: companyMap.get(d.id) ?? 0,
        repCount: du.filter((u) => u.role === "rep").length,
        managerName: manager?.name ?? manager?.email ?? null,
        programs,
        lastImport: null as string | null, // import batches arrive in a later phase
      };
    });
  },

  /** Manufacturers list for the L2 admin (names + user counts). Admin-only. */
  async listManufacturersOverview(ctx: AuthContext) {
    requireAdmin(ctx);
    const db = getDb();
    const [mfrs, mfrUsers] = await Promise.all([
      db
        .select({ id: manufacturer.id, name: manufacturer.name, status: manufacturer.status })
        .from(manufacturer)
        .orderBy(manufacturer.name),
      db
        .select({ manufacturerId: user.manufacturerId })
        .from(user)
        .where(inArray(user.role, ["mfr_regional", "mfr_leadership"])),
    ]);
    return mfrs.map((m) => ({
      ...m,
      userCount: mfrUsers.filter((u) => u.manufacturerId === m.id).length,
    }));
  },

  /**
   * Full manufacturer management data for the admin: each manufacturer with its
   * portal users, its regional users (for assignment pickers), and the
   * distributor program assignments under it. Admin-only.
   */
  async getManufacturersDetail(ctx: AuthContext) {
    requireAdmin(ctx);
    const db = getDb();
    const [mfrs, mUsers, assigns] = await Promise.all([
      db.select({ id: manufacturer.id, name: manufacturer.name, status: manufacturer.status }).from(manufacturer).orderBy(manufacturer.name),
      db
        .select({ id: user.id, name: user.name, email: user.email, role: user.role, manufacturerId: user.manufacturerId })
        .from(user)
        .where(inArray(user.role, ["mfr_regional", "mfr_leadership"]))
        .orderBy(user.email),
      db
        .select({
          pdId: programDistributor.id,
          distributorName: distributor.name,
          cohort: programDistributor.cohort,
          regionalRepUserId: programDistributor.regionalRepUserId,
          programName: manufacturerProgram.name,
          manufacturerId: manufacturerProgram.manufacturerId,
        })
        .from(programDistributor)
        .innerJoin(manufacturerProgram, eq(programDistributor.programId, manufacturerProgram.id))
        .innerJoin(distributor, eq(programDistributor.distributorId, distributor.id))
        .orderBy(distributor.name),
    ]);

    return mfrs.map((m) => {
      const users = mUsers.filter((u) => u.manufacturerId === m.id);
      return {
        id: m.id,
        name: m.name,
        status: m.status,
        users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
        regionals: users.filter((u) => u.role === "mfr_regional").map((u) => ({ id: u.id, name: u.name, email: u.email })),
        assignments: assigns
          .filter((a) => a.manufacturerId === m.id)
          .map((a) => ({ pdId: a.pdId, distributorName: a.distributorName, cohort: a.cohort, programName: a.programName, regionalRepUserId: a.regionalRepUserId })),
      };
    });
  },

  /** Create a manufacturer and its default VIO program. Admin-only. */
  async createManufacturer(ctx: AuthContext, name: string) {
    requireAdmin(ctx);
    const n = name.trim();
    if (!n) throw new ForbiddenError("A manufacturer name is required");
    const db = getDb();
    return db.transaction(async (tx) => {
      const [m] = await tx.insert(manufacturer).values({ name: n }).returning({ id: manufacturer.id });
      // A default program so the manufacturer can be attached to distributors.
      // (Its import source code is set up separately.)
      await tx.insert(manufacturerProgram).values({ manufacturerId: m.id, name: `${n} VIO` });
      await writeAudit(tx as unknown as ReturnType<typeof getDb>, {
        actorUserId: ctx.userId,
        action: "manufacturer.created",
        targetType: "manufacturer",
        targetId: m.id,
        after: { name: n },
      });
      return { id: m.id };
    });
  },

  /** Add a portal user (regional or leadership) to a manufacturer. Admin-only. */
  async createManufacturerUser(
    ctx: AuthContext,
    manufacturerId: string,
    input: { name: string; email: string; role: "mfr_regional" | "mfr_leadership" },
  ) {
    requireAdmin(ctx);
    const email = input.email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new ForbiddenError("A valid email is required");
    if (input.role !== "mfr_regional" && input.role !== "mfr_leadership") throw new ForbiddenError("Invalid role");
    const db = getDb();
    const [m] = await db.select({ id: manufacturer.id }).from(manufacturer).where(eq(manufacturer.id, manufacturerId)).limit(1);
    if (!m) throw new NotFoundError("Manufacturer not found");
    await db.insert(user).values({ email, name: input.name.trim() || null, role: input.role, manufacturerId, status: "active" });
    await writeAudit(db, {
      actorUserId: ctx.userId,
      action: "manufacturer.user_added",
      targetType: "manufacturer",
      targetId: manufacturerId,
      after: { email, role: input.role },
    });
  },

  /** Set (or clear) the regional rep on a program↔distributor assignment. */
  async setProgramAssignmentRep(ctx: AuthContext, programDistributorId: string, regionalRepUserId: string | null) {
    requireAdmin(ctx);
    const db = getDb();
    const [row] = await db.select({ distributorId: programDistributor.distributorId }).from(programDistributor).where(eq(programDistributor.id, programDistributorId)).limit(1);
    if (!row) throw new NotFoundError("Assignment not found");
    await db.update(programDistributor).set({ regionalRepUserId: regionalRepUserId || null }).where(eq(programDistributor.id, programDistributorId));
    await writeAudit(db, {
      distributorId: row.distributorId,
      actorUserId: ctx.userId,
      action: "program.rep_assigned",
      targetType: "program_distributor",
      targetId: programDistributorId,
      after: { regionalRepUserId: regionalRepUserId || null },
    });
  },

  /** Admin lookup of a manufacturer portal user (for issuing a setup link). */
  async getPortalUser(ctx: AuthContext, userId: string) {
    requireAdmin(ctx);
    const db = getDb();
    const [u] = await db
      .select({ id: user.id, email: user.email, name: user.name, role: user.role, manufacturerId: user.manufacturerId })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!u || (u.role !== "mfr_regional" && u.role !== "mfr_leadership")) return null;
    return u;
  },

  // ───────────────────── Manufacturer portal (aggregate-only) ───────────────

  /**
   * Program reporting Overview for a manufacturer user. Aggregate-only: returns
   * KPI totals, a 12-week trend, per-regional-rep rollups (leadership) and
   * per-distributor rows (distributor partner name + the manufacturer's OWN
   * regional-rep name only). Never returns prospect names, contacts, distributor
   * rep identities or quote amounts. Scoped to the user's programs.
   */
  async getManufacturerOverview(ctx: AuthContext, repFilter?: string | null) {
    const { role, manufacturerId, scoped } = await fetchMfrScope(ctx, repFilter);
    const db = getDb();
    const [mfr] = await db.select({ name: manufacturer.name }).from(manufacturer).where(eq(manufacturer.id, manufacturerId)).limit(1);
    const { companies, ints } = await fetchCohort(scoped);

    const intsByCompany = new Map<string, CohortInteraction[]>();
    for (const i of ints) { const a = intsByCompany.get(i.companyId) ?? []; a.push(i); intsByCompany.set(i.companyId, a); }
    const compsByDist = new Map<string, CohortCompany[]>();
    for (const c of companies) { const a = compsByDist.get(c.distributorId) ?? []; a.push(c); compsByDist.set(c.distributorId, a); }

    const distMeta = new Map<string, { name: string; repName: string | null; repId: string | null }>();
    for (const s of scoped) if (!distMeta.has(s.distributorId)) distMeta.set(s.distributorId, { name: s.distributorName, repName: s.regionalRepName, repId: s.regionalRepUserId });

    const distributors = [...distMeta.entries()].map(([id, meta]) => {
      const cs = compsByDist.get(id) ?? [];
      const is = cs.flatMap((c) => intsByCompany.get(c.id) ?? []);
      return { id, name: meta.name, regionalRepName: meta.repName, ...mfrMetrics(cs, is) };
    }).sort((a, b) => b.mor - a.mor);

    const totals = mfrMetrics(companies, ints);
    const trend = mfrTrend(totals.N, ints);

    const repMap = new Map<string, string>();
    for (const s of scoped) if (s.regionalRepUserId) repMap.set(s.regionalRepUserId, s.regionalRepName ?? s.regionalRepEmail ?? "Regional rep");
    const regionalReps = [...repMap.entries()].map(([id, name]) => ({ id, name }));

    let byRep: { repName: string; distributors: number; N: number; mor: number; dmr: number; opp: number; q: number }[] | null = null;
    if (role === "mfr_leadership" && !repFilter) {
      const groups = new Map<string, { name: string; distIds: Set<string> }>();
      for (const s of scoped) {
        const key = s.regionalRepUserId ?? "none";
        const g = groups.get(key) ?? { name: s.regionalRepUserId ? (s.regionalRepName ?? s.regionalRepEmail ?? "Regional rep") : "Unassigned", distIds: new Set<string>() };
        g.distIds.add(s.distributorId); groups.set(key, g);
      }
      byRep = [...groups.values()].map((g) => {
        const cs = [...g.distIds].flatMap((d) => compsByDist.get(d) ?? []);
        const is = cs.flatMap((c) => intsByCompany.get(c.id) ?? []);
        const m = mfrMetrics(cs, is);
        return { repName: g.name, distributors: g.distIds.size, N: m.N, mor: m.mor, dmr: m.dmr, opp: m.opp, q: m.q };
      }).sort((a, b) => b.N - a.N);
    }

    const nDist = distMeta.size;
    const scopeLabel =
      role === "mfr_leadership"
        ? repFilter
          ? `${repMap.get(repFilter) ?? "Rep"} · ${nDist} distributor${nDist === 1 ? "" : "s"}`
          : `All regions · ${nDist} distributor${nDist === 1 ? "" : "s"}`
        : `${nDist} assigned distributor${nDist === 1 ? "" : "s"}`;

    return { manufacturerName: mfr?.name ?? "", role, scopeLabel, regionalReps, activeRepFilter: repFilter ?? null, totals, trend, byRep, distributors };
  },

  /** Program reporting drill-in for one distributor. Verifies the distributor is
   *  in the user's scope. Aggregate-only (KPIs, funnel, trend, industry mix). */
  async getManufacturerDistributor(ctx: AuthContext, distributorId: string) {
    const { manufacturerId, scoped } = await fetchMfrScope(ctx);
    const mine = scoped.filter((s) => s.distributorId === distributorId);
    if (mine.length === 0) throw new ForbiddenError("Distributor not in your programs");
    const db = getDb();
    const { companies, ints } = await fetchCohort(mine);
    const totals = mfrMetrics(companies, ints);
    const trend = mfrTrend(totals.N, ints);

    const funnel = [
      { label: "VIO companies", value: totals.N },
      { label: "Outreach attempted", value: totals.A },
      { label: "DMs identified", value: totals.pdm },
      { label: "DMs reached", value: totals.dmr },
      { label: "Opportunities", value: totals.opp },
      { label: "Companies quoted", value: totals.q },
    ].map((s) => ({ ...s, pct: totals.N ? Math.round((s.value / totals.N) * 100) : 0 }));

    const intsByCompany = new Map<string, CohortInteraction[]>();
    for (const i of ints) { const a = intsByCompany.get(i.companyId) ?? []; a.push(i); intsByCompany.set(i.companyId, a); }
    const indMap = new Map<string, CohortCompany[]>();
    for (const c of companies) { const key = c.industryPrimary ?? "Unspecified"; const a = indMap.get(key) ?? []; a.push(c); indMap.set(key, a); }
    const byIndustry = [...indMap.entries()].map(([industry, cs]) => {
      const is = cs.flatMap((c) => intsByCompany.get(c.id) ?? []);
      const m = mfrMetrics(cs, is);
      const fleet = cs.map((c) => c.totalVehicles).filter((v): v is number => v != null);
      const avgFleet = fleet.length ? Math.round(fleet.reduce((a, b) => a + b, 0) / fleet.length) : 0;
      return { industry, N: m.N, avgFleet, mor: m.mor, dmr: m.dmr, opp: m.opp, q: m.q };
    }).sort((a, b) => b.N - a.N);

    const meta = mine[0];
    const weeksActive = Math.max(1, Math.round((Date.now() - new Date(meta.pdCreatedAt).getTime()) / (7 * 86_400_000)));
    const [mfr] = await db.select({ name: manufacturer.name }).from(manufacturer).where(eq(manufacturer.id, manufacturerId)).limit(1);

    return {
      manufacturerName: mfr?.name ?? "",
      distributorName: meta.distributorName,
      regionalRepName: meta.regionalRepName,
      cohort: meta.cohort,
      weeksActive,
      totals,
      funnel,
      trend,
      byIndustry,
    };
  },

  /** Live subdomain availability for the New Distributor wizard. Admin-only. */
  async checkSlug(ctx: AuthContext, slugRaw: string): Promise<{ state: SlugState }> {
    requireAdmin(ctx);
    const slug = slugRaw.trim().toLowerCase();
    if (!slugShapeOk(slug)) return { state: "bad_format" };
    if (RESERVED_SUBDOMAINS.has(slug)) return { state: "reserved" };
    const db = getDb();
    const [exists] = await db
      .select({ id: distributor.id })
      .from(distributor)
      .where(eq(distributor.slug, slug))
      .limit(1);
    return { state: exists ? "taken" : "ok" };
  },

  /**
   * The manufacturer programs an admin can attach to a distributor, each with
   * its regional users (for the Program step's "Regional rep" picker). Admin-only.
   */
  async listProgramCatalog(ctx: AuthContext) {
    requireAdmin(ctx);
    const db = getDb();
    const [progs, regionals] = await Promise.all([
      db
        .select({
          id: manufacturerProgram.id,
          name: manufacturerProgram.name,
          code: manufacturerProgram.code,
          manufacturerId: manufacturerProgram.manufacturerId,
          manufacturerName: manufacturer.name,
        })
        .from(manufacturerProgram)
        .innerJoin(manufacturer, eq(manufacturerProgram.manufacturerId, manufacturer.id))
        .orderBy(manufacturer.name, manufacturerProgram.name),
      db
        .select({ id: user.id, name: user.name, email: user.email, manufacturerId: user.manufacturerId })
        .from(user)
        .where(and(eq(user.role, "mfr_regional"), eq(user.status, "active"))),
    ]);
    return progs.map((p) => ({
      ...p,
      regionals: regionals
        .filter((r) => r.manufacturerId === p.manufacturerId)
        .map((r) => ({ id: r.id, name: r.name ?? r.email, email: r.email })),
    }));
  },

  /**
   * Provision a distributor: the tenant row, its manager, reps and program
   * assignments, in one transaction, with an audit entry. Admin-only. Returns
   * the new ids so the caller can mint a manager password-setup link.
   */
  async createDistributor(
    ctx: AuthContext,
    input: {
      name: string;
      slug: string;
      primaryColor: string;
      secondaryColor?: string | null;
      logoUrl?: string | null;
      manager: { name: string; email: string };
      reps: { name: string; email: string; dailyTarget: number }[];
      programs: { programId: string; cohort?: string | null; regionalRepUserId?: string | null }[];
    },
  ): Promise<{ id: string; slug: string; managerId: string; managerEmail: string; repCount: number }> {
    requireAdmin(ctx);
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const managerEmail = input.manager.email.trim().toLowerCase();
    if (!name) throw new ForbiddenError("A distributor name is required");
    if (!slugShapeOk(slug) || RESERVED_SUBDOMAINS.has(slug)) {
      throw new ForbiddenError("That subdomain is not allowed");
    }
    if (!/^\S+@\S+\.\S+$/.test(managerEmail)) {
      throw new ForbiddenError("A valid manager email is required");
    }

    const reps = input.reps
      .map((r) => ({ name: r.name.trim(), email: r.email.trim().toLowerCase(), dailyTarget: Math.max(1, r.dailyTarget || 1) }))
      .filter((r) => r.email && /^\S+@\S+\.\S+$/.test(r.email));

    const db = getDb();
    const [taken] = await db
      .select({ id: distributor.id })
      .from(distributor)
      .where(eq(distributor.slug, slug))
      .limit(1);
    if (taken) throw new ForbiddenError("That subdomain is already taken");

    return db.transaction(async (tx) => {
      const [dist] = await tx
        .insert(distributor)
        .values({
          name,
          slug,
          primaryColor: input.primaryColor,
          secondaryColor: input.secondaryColor ?? null,
          logoUrl: input.logoUrl ?? null,
          status: "onboarding",
        })
        .returning({ id: distributor.id });

      const [mgr] = await tx
        .insert(user)
        .values({
          email: managerEmail,
          name: input.manager.name.trim() || null,
          role: "manager",
          distributorId: dist.id,
          status: "active",
        })
        .returning({ id: user.id });

      if (reps.length > 0) {
        await tx.insert(user).values(
          reps.map((r) => ({
            email: r.email,
            name: r.name || null,
            role: "rep" as const,
            distributorId: dist.id,
            dailyTarget: r.dailyTarget,
            status: "active" as const,
          })),
        );
      }

      if (input.programs.length > 0) {
        await tx.insert(programDistributor).values(
          input.programs.map((p) => ({
            programId: p.programId,
            distributorId: dist.id,
            regionalRepUserId: p.regionalRepUserId || null,
            cohort: p.cohort?.trim() || null,
          })),
        );
      }

      await writeAudit(tx as unknown as ReturnType<typeof getDb>, {
        distributorId: dist.id,
        actorUserId: ctx.userId,
        action: "distributor.created",
        targetType: "distributor",
        targetId: dist.id,
        after: { name, slug, reps: reps.length, programs: input.programs.length },
      });

      return { id: dist.id, slug, managerId: mgr.id, managerEmail, repCount: reps.length };
    });
  },

  /**
   * Everything the distributor account page needs: the tenant, its manager and
   * reps, program assignments, the program catalog (for the Programs editor),
   * headline stats, and the recent audit trail. Admin-only.
   */
  async getDistributorAccount(ctx: AuthContext, id: string) {
    requireAdmin(ctx);
    const db = getDb();
    const [dist] = await db.select().from(distributor).where(eq(distributor.id, id)).limit(1);
    if (!dist) throw new NotFoundError("Distributor not found");

    const [users, assignments, companyCount, audit, catalog, imports] = await Promise.all([
      db
        .select({ id: user.id, name: user.name, email: user.email, role: user.role, dailyTarget: user.dailyTarget, status: user.status })
        .from(user)
        .where(and(eq(user.distributorId, id), inArray(user.role, ["manager", "rep"])))
        .orderBy(user.role, user.email),
      db
        .select({ programId: programDistributor.programId, cohort: programDistributor.cohort, regionalRepUserId: programDistributor.regionalRepUserId })
        .from(programDistributor)
        .where(eq(programDistributor.distributorId, id)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(company)
        .where(eq(company.distributorId, id)),
      db
        .select({ action: auditLog.action, createdAt: auditLog.createdAt, actorName: user.name, actorEmail: user.email })
        .from(auditLog)
        .leftJoin(user, eq(auditLog.actorUserId, user.id))
        .where(eq(auditLog.distributorId, id))
        .orderBy(desc(auditLog.createdAt))
        .limit(10),
      this.listProgramCatalog(ctx),
      this.listImports(ctx, id),
    ]);

    const manager = users.find((u) => u.role === "manager") ?? null;
    const reps = users.filter((u) => u.role === "rep");
    return {
      distributor: {
        id: dist.id, name: dist.name, slug: dist.slug, status: dist.status,
        primaryColor: dist.primaryColor, secondaryColor: dist.secondaryColor, logoUrl: dist.logoUrl,
      },
      manager,
      reps,
      assignments,
      catalog,
      imports,
      stats: {
        companyCount: companyCount[0]?.n ?? 0,
        repCount: reps.length,
        programCount: assignments.length,
        lastImport: imports[0]?.createdAt ?? null,
      },
      audit: audit.map((a) => ({
        action: a.action,
        createdAt: a.createdAt,
        actor: a.actorName ?? a.actorEmail ?? "System",
      })),
    };
  },

  /** Change a distributor's lifecycle status (immediate), with an audit entry. */
  async updateDistributorStatus(
    ctx: AuthContext,
    id: string,
    status: "onboarding" | "active" | "paused" | "disabled",
  ) {
    requireAdmin(ctx);
    const db = getDb();
    const [before] = await db.select({ status: distributor.status }).from(distributor).where(eq(distributor.id, id)).limit(1);
    if (!before) throw new NotFoundError("Distributor not found");
    await db.update(distributor).set({ status, updatedAt: new Date() }).where(eq(distributor.id, id));
    await writeAudit(db, {
      distributorId: id,
      actorUserId: ctx.userId,
      action: "distributor.status_changed",
      targetType: "distributor",
      targetId: id,
      before: { status: before.status },
      after: { status },
    });
  },

  /**
   * Save the account draft (branding + manager + reps + program assignments) in
   * one transaction, with an audit entry. Reps with an id are updated (status
   * included, so a removed rep is soft-disabled); reps without an id are
   * created. Program assignments are replaced with the desired set. Admin-only.
   */
  async saveDistributorAccount(
    ctx: AuthContext,
    id: string,
    payload: {
      primaryColor: string;
      secondaryColor?: string | null;
      logoUrl?: string | null;
      manager: { id: string; name: string; email: string } | null;
      reps: { id?: string; name: string; email: string; dailyTarget: number; status: "active" | "paused" | "disabled" }[];
      programs: { programId: string; cohort?: string | null; regionalRepUserId?: string | null }[];
    },
  ) {
    requireAdmin(ctx);
    const db = getDb();
    const [exists] = await db.select({ id: distributor.id }).from(distributor).where(eq(distributor.id, id)).limit(1);
    if (!exists) throw new NotFoundError("Distributor not found");

    await db.transaction(async (tx) => {
      await tx
        .update(distributor)
        .set({
          primaryColor: payload.primaryColor,
          secondaryColor: payload.secondaryColor ?? null,
          logoUrl: payload.logoUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(distributor.id, id));

      if (payload.manager?.id) {
        await tx
          .update(user)
          .set({ name: payload.manager.name.trim() || null, email: payload.manager.email.trim().toLowerCase(), updatedAt: new Date() })
          .where(and(eq(user.id, payload.manager.id), eq(user.distributorId, id), eq(user.role, "manager")));
      }

      for (const r of payload.reps) {
        const email = r.email.trim().toLowerCase();
        if (r.id) {
          await tx
            .update(user)
            .set({ name: r.name.trim() || null, email, dailyTarget: Math.max(1, r.dailyTarget || 1), status: r.status, updatedAt: new Date() })
            .where(and(eq(user.id, r.id), eq(user.distributorId, id), eq(user.role, "rep")));
        } else if (email && /^\S+@\S+\.\S+$/.test(email)) {
          await tx.insert(user).values({ email, name: r.name.trim() || null, role: "rep", distributorId: id, dailyTarget: Math.max(1, r.dailyTarget || 1), status: "active" });
        }
      }

      const keepProgramIds = payload.programs.map((p) => p.programId);
      if (keepProgramIds.length > 0) {
        await tx
          .delete(programDistributor)
          .where(and(eq(programDistributor.distributorId, id), notInArray(programDistributor.programId, keepProgramIds)));
        for (const p of payload.programs) {
          await tx
            .insert(programDistributor)
            .values({ programId: p.programId, distributorId: id, regionalRepUserId: p.regionalRepUserId || null, cohort: p.cohort?.trim() || null })
            .onConflictDoUpdate({
              target: [programDistributor.programId, programDistributor.distributorId],
              set: { regionalRepUserId: p.regionalRepUserId || null, cohort: p.cohort?.trim() || null },
            });
        }
      } else {
        await tx.delete(programDistributor).where(eq(programDistributor.distributorId, id));
      }

      await writeAudit(tx as unknown as ReturnType<typeof getDb>, {
        distributorId: id,
        actorUserId: ctx.userId,
        action: "distributor.updated",
        targetType: "distributor",
        targetId: id,
        after: { reps: payload.reps.length, programs: payload.programs.length },
      });
    });
  },

  // ───────────────────────── L2 Admin: CSV import ──────────────────────────

  /** Dry-run: validate a mapped CSV against the distributor's current data. */
  async previewImport(ctx: AuthContext, distributorId: string, csvText: string, columnMap: Record<string, string>) {
    requireAdmin(ctx);
    const dctx = await buildImportContext(distributorId);
    const dry = runDryRun(parseCsv(csvText), columnMap, dctx);
    return { counts: dry.counts, errors: dry.errors, protectedCounts: dry.protectedCounts };
  },

  /**
   * Commit a mapped CSV: insert new companies and update matching ones (by
   * external_id, scoped to the distributor). Error rows are skipped. Protected
   * local fields are preserved — owner is overwritten from the file only when
   * `overrides.owner` is set; confirmed DM, follow-ups, suppression/DNC,
   * activity, opportunities and quotes are never touched; source program
   * attribution is immutable. Records an import batch (with pre-import snapshots)
   * for rollback, and an audit entry.
   */
  async commitImport(
    ctx: AuthContext,
    distributorId: string,
    csvText: string,
    columnMap: Record<string, string>,
    overrides: { owner?: boolean },
    filename: string,
  ) {
    requireAdmin(ctx);
    const db = getDb();
    const dctx = await buildImportContext(distributorId);
    const dry = runDryRun(parseCsv(csvText), columnMap, dctx);

    const updateExtIds = dry.records.filter((r) => r.isUpdate).map((r) => r.externalId);
    const existingFull = new Map<string, typeof company.$inferSelect>();
    if (updateExtIds.length > 0) {
      const fulls = await db.select().from(company).where(and(eq(company.distributorId, distributorId), inArray(company.externalImportId, updateExtIds)));
      for (const f of fulls) if (f.externalImportId) existingFull.set(f.externalImportId, f);
    }

    const batchId = await db.transaction(async (tx) => {
      const [batch] = await tx
        .insert(importBatch)
        .values({ distributorId, uploadedByUserId: ctx.userId, filename, columnMap, counts: dry.counts, overrides })
        .returning({ id: importBatch.id });

      const changeRows: (typeof importChange.$inferInsert)[] = [];
      for (const rec of dry.records) {
        if (!rec.isUpdate) {
          const [ins] = await tx
            .insert(company)
            .values({ distributorId, externalImportId: rec.externalId, ...descriptiveFields(rec.fields), ownerUserId: rec.ownerUserId, sourceProgramId: rec.sourceProgramId })
            .returning({ id: company.id });
          changeRows.push({ importBatchId: batch.id, companyId: ins.id, wasInsert: true, before: null });
        } else {
          const ex = existingFull.get(rec.externalId)!;
          const before = { ...descriptiveFields(ex), ownerUserId: ex.ownerUserId };
          const set: Partial<typeof company.$inferInsert> = { ...descriptiveFields(rec.fields), updatedAt: new Date() };
          if (overrides.owner) set.ownerUserId = rec.ownerUserId;
          await tx.update(company).set(set).where(eq(company.id, ex.id));
          changeRows.push({ importBatchId: batch.id, companyId: ex.id, wasInsert: false, before: before as never });
        }
      }
      if (changeRows.length > 0) await tx.insert(importChange).values(changeRows);

      await writeAudit(tx as unknown as ReturnType<typeof getDb>, {
        distributorId,
        actorUserId: ctx.userId,
        action: "import.committed",
        targetType: "import_batch",
        targetId: batch.id,
        after: { filename, ...dry.counts, overrides },
      });
      return batch.id;
    });

    return { batchId, counts: dry.counts };
  },

  /** Reverse a committed import: delete created companies, restore updated ones. */
  async rollbackImport(ctx: AuthContext, batchId: string) {
    requireAdmin(ctx);
    const db = getDb();
    const [batch] = await db.select().from(importBatch).where(eq(importBatch.id, batchId)).limit(1);
    if (!batch) throw new NotFoundError("Import not found");
    if (batch.status !== "committed") throw new ForbiddenError("This import was already rolled back");
    const changes = await db.select().from(importChange).where(eq(importChange.importBatchId, batchId));

    await db.transaction(async (tx) => {
      // Remove change rows first so inserted companies can be deleted (FK).
      await tx.delete(importChange).where(eq(importChange.importBatchId, batchId));
      for (const ch of changes) {
        if (ch.wasInsert) {
          await tx.delete(company).where(eq(company.id, ch.companyId));
        } else if (ch.before) {
          await tx.update(company).set({ ...(ch.before as Record<string, unknown>), updatedAt: new Date() }).where(eq(company.id, ch.companyId));
        }
      }
      await tx.update(importBatch).set({ status: "rolled_back", updatedAt: new Date() }).where(eq(importBatch.id, batchId));
      await writeAudit(tx as unknown as ReturnType<typeof getDb>, {
        distributorId: batch.distributorId,
        actorUserId: ctx.userId,
        action: "import.rolled_back",
        targetType: "import_batch",
        targetId: batchId,
        before: batch.counts,
      });
    });
    return { ok: true as const };
  },

  /** Import history for a distributor's account Imports tab. */
  async listImports(ctx: AuthContext, distributorId: string) {
    requireAdmin(ctx);
    const db = getDb();
    const rows = await db
      .select({ id: importBatch.id, filename: importBatch.filename, counts: importBatch.counts, status: importBatch.status, createdAt: importBatch.createdAt, byName: user.name, byEmail: user.email })
      .from(importBatch)
      .leftJoin(user, eq(importBatch.uploadedByUserId, user.id))
      .where(eq(importBatch.distributorId, distributorId))
      .orderBy(desc(importBatch.createdAt));
    return rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      counts: r.counts as { rows: number; created: number; updated: number; skipped: number },
      status: r.status,
      createdAt: r.createdAt,
      by: r.byName ?? r.byEmail ?? "L2 Admin",
    }));
  },

  /**
   * Manager: every company in their distributor.
   * Rep: only companies they own.
   * Manufacturer / L2: denied here (wrong read model).
   */
  async listCompanies(ctx: AuthContext) {
    const distributorId = requireDistributorScope(ctx);
    const db = getDb();
    const where =
      ctx.role === "rep"
        ? and(
            eq(company.distributorId, distributorId),
            eq(company.ownerUserId, ctx.userId),
          )
        : eq(company.distributorId, distributorId);
    return db.select().from(company).where(where);
  },

  /**
   * A rep's cold prospecting queue: companies they own that aren't scheduled
   * elsewhere — never-contacted, plus parked prospects whose cooldown has
   * expired. Rep-set promises and pending No-Contact Retries live in the
   * Follow-up Queue instead.
   *
   * The order is STABLE: companies are ranked by their queue position
   * (`queuedAt`), then by priority within an intake, then name. Because the
   * position is stamped on entry and only reset when a company is parked/rested,
   * a fresh import or a rep being away for a week never reshuffles the prospects
   * at the top — new arrivals queue behind what's already there.
   */
  async listRepQueue(ctx: AuthContext) {
    const distributorId = requireDistributorScope(ctx);
    if (ctx.role !== "rep") {
      throw new ForbiddenError("listRepQueue is for reps");
    }
    const db = getDb();
    const today = todayISO();
    return db
      .select()
      .from(company)
      .where(
        and(
          eq(company.distributorId, distributorId),
          eq(company.ownerUserId, ctx.userId),
          eq(company.lifecycleState, "cold"), // opportunities/customers leave the cold queue
          isNull(company.suppressed),
          // Companies with a follow-up date belong to the Follow-up Queue, not
          // the Prospects queue.
          isNull(company.followUpDate),
          // Parked/resting prospects re-enter automatically once the date passes.
          sql`(${company.nextEligibleDate} is null or ${company.nextEligibleDate} <= ${today})`,
        ),
      )
      .orderBy(
        company.queuedAt,
        sql`${company.priorityScore} desc nulls last`,
        company.name,
      );
  },

  /**
   * The rep's Follow-up Queue: every company with a follow-up date (rep-set or
   * system-assigned), plus customer touch-base reminders. Each row carries its
   * `source` ("rep" | "system") and, for system rows, the triggering outcome as
   * `reason` so the UI can tag it. Due today/overdue rows go to `due`; future
   * ones to `upcoming`. These never count toward the daily prospecting goal.
   * Reps only; scoped to companies they own.
   */
  async listFollowUps(ctx: AuthContext) {
    const distributorId = requireDistributorScope(ctx);
    if (ctx.role !== "rep") {
      throw new ForbiddenError("listFollowUps is for reps");
    }
    const db = getDb();
    const today = todayISO();

    const cols = {
      id: company.id,
      name: company.name,
      city: company.city,
      industryPrimary: company.industryPrimary,
      priorityScore: company.priorityScore,
      lastTouchDate: company.lastTouchDate,
      followUpDate: company.followUpDate,
      followUpNote: company.followUpNote,
      followUpSource: company.followUpSource,
      touchIntervalDays: company.touchIntervalDays,
      lifecycleState: company.lifecycleState,
    };

    const base = and(
      eq(company.distributorId, distributorId),
      eq(company.ownerUserId, ctx.userId),
      isNull(company.suppressed),
    );

    const [followUps, customers] = await Promise.all([
      db
        .select(cols)
        .from(company)
        .where(and(base, isNotNull(company.followUpDate)))
        .orderBy(company.followUpDate),
      db
        .select(cols)
        .from(company)
        .where(
          and(
            base,
            eq(company.lifecycleState, "customer"),
            isNotNull(company.touchIntervalDays),
          ),
        ),
    ]);

    // Latest logged outcome per follow-up company — the reason on system rows.
    const fuIds = followUps.map((c) => c.id);
    const lastOutcome = new Map<string, string>();
    if (fuIds.length > 0) {
      const ints = await db
        .select({
          companyId: interaction.companyId,
          outcome: interaction.outcome,
          createdAt: interaction.createdAt,
        })
        .from(interaction)
        .where(
          and(
            eq(interaction.distributorId, distributorId),
            inArray(interaction.companyId, fuIds),
          ),
        )
        .orderBy(desc(interaction.createdAt));
      for (const it of ints) {
        if (!lastOutcome.has(it.companyId)) lastOutcome.set(it.companyId, it.outcome);
      }
    }

    type Reminder = {
      id: string;
      name: string;
      city: string | null;
      industryPrimary: string | null;
      priorityScore: string | null;
      lastTouchDate: string | null;
      dueDate: string;
      note: string | null;
      source: "rep" | "system" | null;
      reason: string | null;
      kind: "follow_up" | "touch_base";
    };

    const due: Reminder[] = [];
    const upcoming: Reminder[] = [];

    for (const c of followUps) {
      const dueDate = c.followUpDate as string;
      const source = (c.followUpSource as "rep" | "system" | null) ?? null;
      const last = lastOutcome.get(c.id);
      const row: Reminder = {
        id: c.id,
        name: c.name,
        city: c.city,
        industryPrimary: c.industryPrimary,
        priorityScore: c.priorityScore,
        lastTouchDate: c.lastTouchDate,
        dueDate,
        note: c.followUpNote,
        source,
        reason: source === "system" && last ? (outcomeMeta(last)?.label ?? null) : null,
        kind: "follow_up",
      };
      if (dueDate <= today) due.push(row);
      else upcoming.push(row);
    }

    // Customer touch-base: due when the interval has elapsed since last touch
    // (or there has never been one).
    for (const c of customers) {
      const interval = c.touchIntervalDays as number;
      const nextTouch = c.lastTouchDate
        ? addDaysFromISO(c.lastTouchDate, interval)
        : today;
      if (nextTouch <= today) {
        due.push({
          id: c.id,
          name: c.name,
          city: c.city,
          industryPrimary: c.industryPrimary,
          priorityScore: c.priorityScore,
          lastTouchDate: c.lastTouchDate,
          dueDate: nextTouch,
          note: `Customer check-in every ${interval} days`,
          source: null,
          reason: null,
          kind: "touch_base",
        });
      }
    }

    // Rep-set follow-ups first, then system-assigned, then customer check-ins;
    // by due date within each group.
    const rank = (r: Reminder) =>
      r.kind === "touch_base" ? 2 : r.source === "rep" ? 0 : 1;
    const order = (a: Reminder, b: Reminder) =>
      rank(a) - rank(b) || a.dueDate.localeCompare(b.dueDate);
    due.sort(order);
    upcoming.sort(order);
    return { due, upcoming };
  },

  /** One company, only if it is inside the caller's scope (rep: owned). */
  async getCompanyInScope(ctx: AuthContext, companyId: string) {
    const distributorId = requireDistributorScope(ctx);
    const db = getDb();
    const where =
      ctx.role === "rep"
        ? and(
            eq(company.id, companyId),
            eq(company.distributorId, distributorId),
            eq(company.ownerUserId, ctx.userId),
          )
        : and(
            eq(company.id, companyId),
            eq(company.distributorId, distributorId),
          );
    const rows = await db.select().from(company).where(where).limit(1);
    return rows[0] ?? null;
  },

  /** Recent interactions for a company the caller can see. */
  async listInteractions(ctx: AuthContext, companyId: string, limit = 20) {
    const distributorId = requireDistributorScope(ctx);
    const db = getDb();
    return db
      .select({
        id: interaction.id,
        channel: interaction.channel,
        outcome: interaction.outcome,
        note: interaction.note,
        createdAt: interaction.createdAt,
        repEmail: user.email,
      })
      .from(interaction)
      .innerJoin(user, eq(interaction.repUserId, user.id))
      .where(
        and(
          eq(interaction.companyId, companyId),
          eq(interaction.distributorId, distributorId),
        ),
      )
      .orderBy(desc(interaction.createdAt))
      .limit(limit);
  },

  /**
   * Log an outcome against a company the caller owns, then apply the outcome's
   * cadence/lifecycle/suppression effects to that company in the same request.
   * Throws NotFoundError if the company is not in the caller's scope — so a rep
   * can never log against a company they do not own.
   */
  async logInteraction(
    ctx: AuthContext,
    input: {
      companyId: string;
      outcome: OutcomeValue;
      note?: string | null;
      /** Decision-Maker only: "not interested now" uses the longer cadence. */
      notInterested?: boolean;
      /** Explicit follow-up in days from today; overrides the outcome cadence. */
      followUpDays?: number | null;
      /** Flag an opportunity — the prospect leaves the cold queue. */
      opportunity?: boolean;
      /** Remove from outreach (reversible) or mark do-not-contact (permanent). */
      remove?: "remove" | "dnc" | null;
    },
  ) {
    const distributorId = requireDistributorScope(ctx);
    const target = await this.getCompanyInScope(ctx, input.companyId);
    if (!target) {
      throw new NotFoundError("Company not found in scope");
    }

    const meta = outcomeMeta(input.outcome);
    if (!meta) throw new ForbiddenError(`Unknown outcome ${input.outcome}`);

    // Compose the note the way the prototype does (prefix special cases).
    let note = input.note?.trim() || "";
    if (input.outcome === "decision_maker" && input.notInterested) {
      note = `Not interested now. ${note}`.trim();
    }

    const db = getDb();
    const [row] = await db
      .insert(interaction)
      .values({
        distributorId,
        companyId: input.companyId,
        repUserId: ctx.userId,
        channel: "call",
        outcome: input.outcome,
        note: note || null,
      })
      .returning({ id: interaction.id });

    const [distRow] = await db
      .select({ settings: distributor.settings, name: distributor.name })
      .from(distributor)
      .where(eq(distributor.id, distributorId))
      .limit(1);
    const settings = mergeSettings(distRow?.settings);
    const cadences = settings.cadence;

    // Unified follow-up model. Every non-terminal outcome either:
    //  · rep set a date  → follow-up (source "rep"), never parks
    //  · no rep date, under the parking threshold → system-default follow-up
    //    (source "system") at the outcome's cadence
    //  · no rep date, threshold reached → PARK for parkDays, then re-enter the
    //    Prospects queue at the back; the attempt counter resets.
    // Terminal: opportunity leaves the queue; remove suppresses; wrong_number
    // parks far out, creates no follow-up and alerts L2 Digital.
    const prev = target.attemptCount ?? 0;
    const parkThreshold = settings.parking.attemptsBeforeParking;

    let nextEligibleDate: string | null = null; // null ⇒ eligible now (Prospects)
    let attemptCount = prev;
    let followUpDate: string | null = null;
    let followUpNote: string | null = null;
    let followUpSource: "rep" | "system" | null = null;
    let bumpQueue = false; // reset queue position → send to the back on park
    let parked = false;
    let wrongNumber = false;

    if (input.remove) {
      attemptCount = 0;
    } else if (input.opportunity) {
      // Becomes an opportunity (lifecycle set below) — leaves the queue.
      attemptCount = 0;
    } else if (input.outcome === "wrong_number") {
      // Data-quality — parked far out until corrected; not an attempt. Alerted.
      nextEligibleDate = addDaysISO(3650);
      bumpQueue = true;
      wrongNumber = true;
    } else {
      // Normal non-terminal outcome — counts toward parking.
      attemptCount = prev + 1;
      if (input.followUpDays != null) {
        // Rep-set date overrides parking — always stays in the Follow-up Queue.
        followUpDate = addDaysISO(input.followUpDays);
        followUpNote = note || null;
        followUpSource = "rep";
      } else if (attemptCount >= parkThreshold) {
        // Threshold reached on a system-default log → park, reset the counter.
        nextEligibleDate = addDaysISO(settings.parking.parkDays);
        attemptCount = 0;
        bumpQueue = true;
        parked = true;
      } else {
        // System-assigned follow-up at the outcome's cadence.
        const cadKey: CadenceKey =
          input.outcome === "decision_maker" && input.notInterested
            ? "not_interested"
            : (input.outcome as CadenceKey);
        const cadence = cadences[cadKey];
        followUpDate = addDaysISO(cadence == null ? 3 : cadence);
        followUpNote = note || null;
        followUpSource = "system";
      }
    }

    const patch: Partial<typeof company.$inferInsert> = {
      lastTouchDate: todayISO(),
      nextEligibleDate,
      retryDate: null, // deprecated column — clear any legacy value
      attemptCount,
      followUpDate,
      followUpNote,
      followUpSource,
      updatedAt: new Date(),
    };
    if (bumpQueue) patch.queuedAt = new Date();
    if (input.opportunity) patch.lifecycleState = "opp";
    if (input.remove) patch.suppressed = input.remove;

    await db.update(company).set(patch).where(eq(company.id, input.companyId));

    // Wrong-number alert (best-effort — never fails the log).
    if (wrongNumber) {
      try {
        await sendWrongNumberAlert({
          distributorName: distRow?.name ?? "Distributor",
          companyName: target.name,
          city: target.city ?? null,
          phone: target.phone ?? null,
          repEmail: null,
        });
      } catch {
        /* swallow — the outcome is already logged */
      }
    }

    return {
      interactionId: row.id,
      followUpDate,
      followUpSource,
      parked,
      parkedUntil: parked ? nextEligibleDate : null,
      wrongNumber,
    };
  },

  /** How many interactions the rep has logged today vs their daily target. */
  async getRepDayProgress(ctx: AuthContext) {
    requireDistributorScope(ctx);
    const db = getDb();
    const [{ worked }] = await db
      .select({ worked: sql<number>`count(*)::int` })
      .from(interaction)
      .where(
        and(
          eq(interaction.repUserId, ctx.userId),
          gte(interaction.createdAt, startOfTodayUTC()),
        ),
      );
    const [u] = await db
      .select({ target: user.dailyTarget })
      .from(user)
      .where(eq(user.id, ctx.userId))
      .limit(1);
    return { worked: worked ?? 0, target: u?.target ?? null };
  },

  /** Distinct companies this rep has logged an outcome against today — used to
   *  mark queue rows "done" for the day's session. */
  async listCompaniesWorkedToday(ctx: AuthContext): Promise<string[]> {
    requireDistributorScope(ctx);
    const db = getDb();
    const rows = await db
      .selectDistinct({ companyId: interaction.companyId })
      .from(interaction)
      .where(
        and(
          eq(interaction.repUserId, ctx.userId),
          gte(interaction.createdAt, startOfTodayUTC()),
        ),
      );
    return rows.map((r) => r.companyId);
  },

  /**
   * System/scheduled-job read (no AuthContext): the roster for the daily email
   * — active distributors and their active, email-enabled reps. Deliberately
   * cross-tenant because the cron serves every tenant; it returns only roster
   * data (names, emails, settings). Each rep's actual prospect data is still
   * read through the tenant-scoped methods with that rep's own context.
   */
  async listDailyEmailRoster() {
    const db = getDb();
    const [dists, reps] = await Promise.all([
      db
        .select({
          id: distributor.id,
          slug: distributor.slug,
          name: distributor.name,
          primaryColor: distributor.primaryColor,
          settings: distributor.settings,
        })
        .from(distributor)
        .where(eq(distributor.status, "active")),
      db
        .select({
          id: user.id,
          email: user.email,
          distributorId: user.distributorId,
          dailyTarget: user.dailyTarget,
        })
        .from(user)
        .where(
          and(
            eq(user.role, "rep"),
            eq(user.status, "active"),
            eq(user.dailyEmailEnabled, true),
          ),
        ),
    ]);
    return dists
      .map((ds) => ({ ...ds, reps: reps.filter((r) => r.distributorId === ds.id) }))
      .filter((ds) => ds.reps.length > 0);
  },

  /** Confirm/update the primary decision-maker for a company the rep owns. */
  async saveDecisionMaker(
    ctx: AuthContext,
    companyId: string,
    dm: { name: string; title?: string; phone?: string; email?: string; notes?: string },
  ) {
    const target = await this.getCompanyInScope(ctx, companyId);
    if (!target) throw new NotFoundError("Company not found in scope");
    if (!dm.name.trim()) throw new ForbiddenError("A name is required");
    const db = getDb();
    await db
      .update(company)
      .set({
        decisionMaker: {
          name: dm.name.trim(),
          title: dm.title?.trim() || null,
          phone: dm.phone?.trim() || null,
          email: dm.email?.trim() || null,
          notes: dm.notes?.trim() || null,
        },
        decisionMakerAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(company.id, companyId));
  },

  async removeDecisionMaker(ctx: AuthContext, companyId: string) {
    const target = await this.getCompanyInScope(ctx, companyId);
    if (!target) throw new NotFoundError("Company not found in scope");
    const db = getDb();
    await db
      .update(company)
      .set({ decisionMaker: null, decisionMakerAt: null, updatedAt: new Date() })
      .where(eq(company.id, companyId));
  },

  /** Record that a quote was sent (increments the company's quote count). */
  async recordQuote(ctx: AuthContext, companyId: string) {
    const target = await this.getCompanyInScope(ctx, companyId);
    if (!target) throw new NotFoundError("Company not found in scope");
    const db = getDb();
    const [row] = await db
      .update(company)
      .set({ quoteCount: sql`${company.quoteCount} + 1`, updatedAt: new Date() })
      .where(eq(company.id, companyId))
      .returning({ quoteCount: company.quoteCount });
    return row.quoteCount;
  },

  /**
   * Team leaderboard for the rep's own queue — aggregate per-rep rankings only
   * (no company names or contacts), gated by the distributor's leaderboard
   * setting. Returns null when the manager has turned it off.
   */
  async getLeaderboard(ctx: AuthContext, period: "today" | "week" | "month") {
    const distributorId = requireDistributorScope(ctx);
    const db = getDb();
    const [distRow] = await db
      .select({ settings: distributor.settings })
      .from(distributor)
      .where(eq(distributor.id, distributorId))
      .limit(1);
    if (!mergeSettings(distRow?.settings).leaderboard.enabled) return null;

    const workingDays = { today: 1, week: 5, month: 22 }[period];
    const since =
      period === "today"
        ? startOfTodayUTC()
        : new Date(Date.now() - (period === "week" ? 7 : 30) * 86_400_000);

    const [reps, acts, comps] = await Promise.all([
      db
        .select({ id: user.id, email: user.email, dailyTarget: user.dailyTarget })
        .from(user)
        .where(and(eq(user.distributorId, distributorId), eq(user.role, "rep"), eq(user.status, "active"))),
      db
        .select({ repUserId: interaction.repUserId, outcome: interaction.outcome, createdAt: interaction.createdAt })
        .from(interaction)
        .where(eq(interaction.distributorId, distributorId)),
      db
        .select({ ownerUserId: company.ownerUserId, lifecycleState: company.lifecycleState })
        .from(company)
        .where(eq(company.distributorId, distributorId)),
    ]);

    const isAttempt = (o: string) => ["no_answer", "voicemail", "gatekeeper", "decision_maker"].includes(o);
    const periodActs = acts.filter((a) => a.createdAt >= since);

    const rows = reps
      .map((r) => {
        const ra = periodActs.filter((a) => a.repUserId === r.id);
        const calls = ra.filter((a) => isAttempt(a.outcome)).length;
        const dm = ra.filter((a) => a.outcome === "decision_maker").length;
        const opp = comps.filter((c) => c.ownerUserId === r.id && c.lifecycleState === "opp").length;
        const target = r.dailyTarget ?? 0;
        const denom = target * workingDays;
        return {
          id: r.id,
          email: r.email,
          calls,
          goalPct: denom ? Math.round((calls / denom) * 100) : null,
          dm,
          opp,
          conv: dm ? Math.round((opp / dm) * 100) : null,
          isMe: r.id === ctx.userId,
        };
      })
      .sort((a, b) => b.calls - a.calls)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return { rows, period };
  },

  /**
   * Find-by-ZIP for reps. Cross-owner by design: shows every cold prospect in
   * the ZIP with its owner (never changes ownership), scoped to the distributor.
   * Includes coordinates/place id so the queue map can drop pins.
   */
  async searchCompaniesByZip(ctx: AuthContext, zip: string) {
    const distributorId = requireDistributorScope(ctx);
    const db = getDb();
    return db
      .select({
        id: company.id,
        name: company.name,
        address: company.address,
        city: company.city,
        state: company.state,
        zip: company.zip,
        phone: company.phone,
        industryPrimary: company.industryPrimary,
        priorityScore: company.priorityScore,
        lastTouchDate: company.lastTouchDate,
        ownerUserId: company.ownerUserId,
        ownerEmail: user.email,
        placeId: company.placeId,
        latitude: company.latitude,
        longitude: company.longitude,
      })
      .from(company)
      .leftJoin(user, eq(company.ownerUserId, user.id))
      .where(
        and(
          eq(company.distributorId, distributorId),
          eq(company.zip, zip),
          eq(company.lifecycleState, "cold"),
          isNull(company.suppressed),
        ),
      )
      .orderBy(sql`${company.priorityScore} desc nulls last`);
  },

  // ───────────────────────── Manager: reps, assignment, import ─────────────

  /** Active reps in the manager's distributor (for the assignment picker). */
  async listReps(ctx: AuthContext) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    return db
      .select({ id: user.id, email: user.email, dailyTarget: user.dailyTarget })
      .from(user)
      .where(
        and(
          eq(user.distributorId, distributorId),
          eq(user.role, "rep"),
          eq(user.status, "active"),
        ),
      )
      .orderBy(user.email);
  },

  /**
   * Assign (or, with ownerUserId null, unassign) companies to a rep. Scoped to
   * the manager's distributor; the target must be a rep in that distributor.
   * Returns the number of companies changed.
   */
  async assignCompanies(
    ctx: AuthContext,
    companyIds: string[],
    ownerUserId: string | null,
  ) {
    const distributorId = requireManager(ctx);
    if (companyIds.length === 0) return 0;
    const db = getDb();

    if (ownerUserId) {
      const [rep] = await db
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            eq(user.id, ownerUserId),
            eq(user.distributorId, distributorId),
            eq(user.role, "rep"),
          ),
        )
        .limit(1);
      if (!rep) throw new ForbiddenError("Target is not a rep in your distributor");
    }

    const changed = await db
      .update(company)
      .set({ ownerUserId: ownerUserId ?? null, updatedAt: new Date() })
      .where(
        and(
          eq(company.distributorId, distributorId),
          inArray(company.id, companyIds),
        ),
      )
      .returning({ id: company.id });
    return changed.length;
  },

  /**
   * Upsert imported companies into the manager's distributor, deduped on
   * external_import_id. Updates only descriptive fields — a rep's owner,
   * lifecycle, suppression and cadence are preserved on re-import.
   */
  async importCompanies(ctx: AuthContext, companies: CompanyImport[]) {
    const distributorId = requireManager(ctx);
    if (companies.length === 0) return { inserted: 0, updated: 0 };
    const db = getDb();

    const ids = companies.map((c) => c.externalImportId);
    const existingRows = await db
      .select({ ext: company.externalImportId })
      .from(company)
      .where(
        and(
          eq(company.distributorId, distributorId),
          inArray(company.externalImportId, ids),
        ),
      );
    const existing = new Set(existingRows.map((r) => r.ext));

    await db
      .insert(company)
      .values(companies.map((c) => ({ distributorId, ...c })))
      .onConflictDoUpdate({
        target: [company.distributorId, company.externalImportId],
        set: {
          name: sql`excluded.name`,
          address: sql`excluded.address`,
          city: sql`excluded.city`,
          state: sql`excluded.state`,
          zip: sql`excluded.zip`,
          phone: sql`excluded.phone`,
          website: sql`excluded.website`,
          industryPrimary: sql`excluded.industry_primary`,
          industrySub: sql`excluded.industry_sub`,
          description: sql`excluded.description`,
          totalVehicles: sql`excluded.total_vehicles`,
          truckCount: sql`excluded.truck_count`,
          vanCount: sql`excluded.van_count`,
          fleetMix: sql`excluded.fleet_mix`,
          priorityScore: sql`excluded.priority_score`,
          priorityExplanation: sql`excluded.priority_explanation`,
          placeId: sql`excluded.place_id`,
          latitude: sql`excluded.latitude`,
          longitude: sql`excluded.longitude`,
          updatedAt: new Date(),
        },
      });

    const updated = companies.filter((c) => existing.has(c.externalImportId)).length;
    return { inserted: companies.length - updated, updated };
  },

  // ───────────────────────── Manager: overview, team, settings ─────────────

  /** Lead funnel + team/per-rep performance for the manager Overview. */
  async getManagerOverview(ctx: AuthContext, period: "today" | "week" | "month") {
    const distributorId = requireManager(ctx);
    const db = getDb();
    const workingDays = { today: 1, week: 5, month: 22 }[period];
    const since =
      period === "today"
        ? startOfTodayUTC()
        : new Date(Date.now() - (period === "week" ? 7 : 30) * 86_400_000);

    const [companies, acts, reps] = await Promise.all([
      db
        .select({
          id: company.id,
          ownerUserId: company.ownerUserId,
          lifecycleState: company.lifecycleState,
          decisionMaker: company.decisionMaker,
          quoteCount: company.quoteCount,
        })
        .from(company)
        .where(eq(company.distributorId, distributorId)),
      db
        .select({
          companyId: interaction.companyId,
          repUserId: interaction.repUserId,
          outcome: interaction.outcome,
          createdAt: interaction.createdAt,
        })
        .from(interaction)
        .where(eq(interaction.distributorId, distributorId)),
      this.listReps(ctx),
    ]);

    const isAttempt = (o: string) =>
      ["no_answer", "voicemail", "gatekeeper", "decision_maker"].includes(o);
    const isContact = (o: string) => ["gatekeeper", "decision_maker"].includes(o);
    const byCompany = new Map<string, typeof acts>();
    for (const a of acts) {
      const arr = byCompany.get(a.companyId) ?? [];
      arr.push(a);
      byCompany.set(a.companyId, arr);
    }

    const pool = companies.filter((c) => c.lifecycleState !== "customer");
    const poolTotal = pool.length;
    const unassigned = pool.filter((c) => !c.ownerUserId).length;
    const attempted = pool.filter((c) =>
      (byCompany.get(c.id) ?? []).some((a) => isAttempt(a.outcome)),
    ).length;
    const contacted = pool.filter((c) =>
      (byCompany.get(c.id) ?? []).some((a) => isContact(a.outcome)),
    ).length;
    const opportunities = pool.filter((c) => c.lifecycleState === "opp").length;
    const decisionMakers = pool.filter((c) => c.decisionMaker != null).length;

    const periodActs = acts.filter((a) => a.createdAt >= since);
    const perRep = reps.map((r) => {
      const ra = periodActs.filter((a) => a.repUserId === r.id);
      const mine = companies.filter((c) => c.ownerUserId === r.id);
      const attempts = ra.filter((a) => isAttempt(a.outcome)).length;
      const dm = ra.filter((a) => a.outcome === "decision_maker").length;
      const opp = mine.filter((c) => c.lifecycleState === "opp").length;
      const pdm = mine.filter((c) => c.decisionMaker != null).length;
      const quoted = mine.filter((c) => (c.quoteCount ?? 0) > 0).length;
      const target = r.dailyTarget ?? 0;
      const denom = target * workingDays;
      return {
        id: r.id,
        email: r.email,
        target,
        goal: target * workingDays,
        attempts,
        pdm,
        dm,
        opportunities: opp,
        quoted,
        attainment: denom ? Math.round((attempts / denom) * 100) : null,
        oppYield: dm ? Math.round((opp / dm) * 100) : null,
      };
    });
    const team = {
      target: perRep.reduce((t, r) => t + r.target, 0),
      attempts: perRep.reduce((t, r) => t + r.attempts, 0),
      pdm: perRep.reduce((t, r) => t + r.pdm, 0),
      dm: perRep.reduce((t, r) => t + r.dm, 0),
      opportunities: perRep.reduce((t, r) => t + r.opportunities, 0),
      quoted: perRep.reduce((t, r) => t + r.quoted, 0),
    };
    const teamDenom = team.target * workingDays;

    return {
      funnel: {
        poolTotal,
        assigned: poolTotal - unassigned,
        unassigned,
        attempted,
        contacted,
        decisionMakers,
        opportunities,
      },
      perRep,
      team: {
        ...team,
        attainment: teamDenom ? Math.round((team.attempts / teamDenom) * 100) : null,
        oppYield: team.dm ? Math.round((team.opportunities / team.dm) * 100) : null,
      },
      period,
      workingDays,
    };
  },

  /**
   * The manager overview plus, when requested, a prior-period comparison of the
   * two time-bounded activity metrics (attempts and DM conversations) — used by
   * the manager summary email. The snapshot metrics (opportunities, quoted,
   * DMs identified) are current-state counts, so they carry no period trend.
   */
  async getManagerSummary(
    ctx: AuthContext,
    period: "today" | "week" | "month",
    compareTrend: boolean,
  ) {
    const overview = await this.getManagerOverview(ctx, period);
    if (!compareTrend) return { ...overview, trend: null };

    const distributorId = requireManager(ctx);
    const db = getDb();
    const windowDays = period === "today" ? 1 : period === "week" ? 7 : 30;
    const now = Date.now();
    const curStart = new Date(now - windowDays * 86_400_000);
    const prevStart = new Date(now - 2 * windowDays * 86_400_000);
    const prevActs = await db
      .select({ outcome: interaction.outcome })
      .from(interaction)
      .where(
        and(
          eq(interaction.distributorId, distributorId),
          gte(interaction.createdAt, prevStart),
          lt(interaction.createdAt, curStart),
        ),
      );
    const isAttempt = (o: string) =>
      ["no_answer", "voicemail", "gatekeeper", "decision_maker"].includes(o);
    const trend = {
      prevAttempts: prevActs.filter((a) => isAttempt(a.outcome)).length,
      prevDm: prevActs.filter((a) => a.outcome === "decision_maker").length,
    };
    return { ...overview, trend };
  },

  /**
   * System/scheduled-job read (no AuthContext): active distributors, their
   * summary settings, and their active managers — for the manager summary
   * email. Like listDailyEmailRoster, deliberately cross-tenant for the cron.
   */
  async listManagerSummaryRoster() {
    const db = getDb();
    const [dists, managers] = await Promise.all([
      db
        .select({
          id: distributor.id,
          slug: distributor.slug,
          name: distributor.name,
          primaryColor: distributor.primaryColor,
          settings: distributor.settings,
        })
        .from(distributor)
        .where(eq(distributor.status, "active")),
      db
        .select({ id: user.id, email: user.email, distributorId: user.distributorId })
        .from(user)
        .where(and(eq(user.role, "manager"), eq(user.status, "active"))),
    ]);
    return dists.map((ds) => ({
      ...ds,
      managers: managers.filter((m) => m.distributorId === ds.id),
    }));
  },

  /** Reps (any status) with company counts and last-active timestamp. */
  async listTeam(ctx: AuthContext) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    const [reps, counts, last] = await Promise.all([
      db
        .select({
          id: user.id,
          email: user.email,
          dailyTarget: user.dailyTarget,
          status: user.status,
          dailyEmailEnabled: user.dailyEmailEnabled,
        })
        .from(user)
        .where(and(eq(user.distributorId, distributorId), eq(user.role, "rep")))
        .orderBy(user.email),
      db
        .select({ ownerUserId: company.ownerUserId, n: sql<number>`count(*)::int` })
        .from(company)
        .where(eq(company.distributorId, distributorId))
        .groupBy(company.ownerUserId),
      db
        .select({
          repUserId: interaction.repUserId,
          last: sql<string>`max(${interaction.createdAt})`,
        })
        .from(interaction)
        .where(eq(interaction.distributorId, distributorId))
        .groupBy(interaction.repUserId),
    ]);
    const countMap = new Map(counts.map((c) => [c.ownerUserId, c.n]));
    const lastMap = new Map(last.map((l) => [l.repUserId, l.last]));
    return reps.map((r) => ({
      ...r,
      companyCount: countMap.get(r.id) ?? 0,
      lastActive: lastMap.get(r.id) ?? null,
    }));
  },

  async updateRep(
    ctx: AuthContext,
    repId: string,
    patch: { dailyTarget?: number; status?: "active" | "paused" | "disabled"; dailyEmailEnabled?: boolean },
  ) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    const set: Partial<typeof user.$inferInsert> = { updatedAt: new Date() };
    if (patch.dailyTarget !== undefined) set.dailyTarget = patch.dailyTarget;
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.dailyEmailEnabled !== undefined) set.dailyEmailEnabled = patch.dailyEmailEnabled;
    const res = await db
      .update(user)
      .set(set)
      .where(and(eq(user.id, repId), eq(user.distributorId, distributorId), eq(user.role, "rep")))
      .returning({ id: user.id });
    if (!res[0]) throw new NotFoundError("Rep not found");
  },

  async createRep(ctx: AuthContext, input: { email: string; dailyTarget: number }) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    await db.insert(user).values({
      email: input.email.trim().toLowerCase(),
      role: "rep",
      distributorId,
      dailyTarget: input.dailyTarget,
      status: "active",
    });
  },

  async revokeRepSessions(ctx: AuthContext, repId: string) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    const [r] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, repId), eq(user.distributorId, distributorId)))
      .limit(1);
    if (!r) throw new NotFoundError("Rep not found");
    await db
      .update(session)
      .set({ revokedAt: new Date() })
      .where(and(eq(session.userId, repId), isNull(session.revokedAt)));
  },

  /** Move every company owned by one rep to another rep (or unassign). */
  async reassignCompanies(ctx: AuthContext, fromRepId: string, toRepId: string | null) {
    const distributorId = requireManager(ctx);
    const db = getDb();
    if (toRepId) {
      const [t] = await db
        .select({ id: user.id })
        .from(user)
        .where(and(eq(user.id, toRepId), eq(user.distributorId, distributorId), eq(user.role, "rep")))
        .limit(1);
      if (!t) throw new ForbiddenError("Target is not a rep in your distributor");
    }
    const res = await db
      .update(company)
      .set({ ownerUserId: toRepId ?? null, updatedAt: new Date() })
      .where(and(eq(company.distributorId, distributorId), eq(company.ownerUserId, fromRepId)))
      .returning({ id: company.id });
    return res.length;
  },

  /** Full manager settings (merged over defaults). */
  async getSettings(ctx: AuthContext): Promise<ManagerSettings> {
    const distributorId = requireManager(ctx);
    const db = getDb();
    const [d] = await db
      .select({ settings: distributor.settings })
      .from(distributor)
      .where(eq(distributor.id, distributorId))
      .limit(1);
    return mergeSettings(d?.settings);
  },

  /**
   * Save the whole settings section at once: update existing reps, create new
   * ones, and write the distributor-level settings. Returns the fresh team and
   * settings so the client can reset its baseline.
   */
  async saveManagerSettings(
    ctx: AuthContext,
    payload: {
      reps: { id: string; dailyTarget: number; status: "active" | "paused" | "disabled"; dailyEmailEnabled: boolean }[];
      newReps: { email: string; dailyTarget: number }[];
      settings: ManagerSettings;
    },
  ) {
    const distributorId = requireManager(ctx);
    const db = getDb();

    for (const r of payload.reps) {
      await db
        .update(user)
        .set({
          dailyTarget: r.dailyTarget,
          status: r.status,
          dailyEmailEnabled: r.dailyEmailEnabled,
          updatedAt: new Date(),
        })
        .where(and(eq(user.id, r.id), eq(user.distributorId, distributorId), eq(user.role, "rep")));
    }

    for (const nr of payload.newReps) {
      const email = nr.email.trim().toLowerCase();
      if (!email.includes("@")) continue;
      await db
        .insert(user)
        .values({ email, role: "rep", distributorId, dailyTarget: nr.dailyTarget, status: "active" })
        .onConflictDoNothing();
    }

    await db
      .update(distributor)
      .set({ settings: mergeSettings(payload.settings), updatedAt: new Date() })
      .where(eq(distributor.id, distributorId));

    return { team: await this.listTeam(ctx), settings: await this.getSettings(ctx) };
  },
};
