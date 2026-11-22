import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "./client";
import {
  auditLog,
  company,
  distributor,
  interaction,
  manufacturer,
  manufacturerProgram,
  programDistributor,
  session,
  user,
} from "./schema";
import { RESERVED_SUBDOMAINS } from "../tenancy/reserved-slugs";
import type { AuthContext } from "../auth/context";
import { isManufacturerRole } from "../auth/context";
import { outcomeMeta, type OutcomeValue } from "../rep/outcomes";
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
          // Rep-set promises and No-Contact Retries belong to the Follow-up
          // Queue, not the cold queue.
          isNull(company.followUpDate),
          isNull(company.retryDate),
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
   * The rep's Follow-up Queue: rep-set promises (highest priority), No-Contact
   * Retries (the automatic "try again" after a first no-contact outreach), and
   * customer touch-base reminders. Promises and retries each sit here instead of
   * the cold queue. Due today/overdue rows go to `due`; future ones to
   * `upcoming`. These never count toward the daily cold-prospecting goal. Reps
   * only; scoped to companies they own.
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
      retryDate: company.retryDate,
      touchIntervalDays: company.touchIntervalDays,
      lifecycleState: company.lifecycleState,
    };

    const base = and(
      eq(company.distributorId, distributorId),
      eq(company.ownerUserId, ctx.userId),
      isNull(company.suppressed),
    );

    const [explicit, retries, customers] = await Promise.all([
      db
        .select(cols)
        .from(company)
        .where(and(base, isNotNull(company.followUpDate)))
        .orderBy(company.followUpDate),
      db
        .select(cols)
        .from(company)
        .where(and(base, isNotNull(company.retryDate)))
        .orderBy(company.retryDate),
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

    // Activity context for retry rows: the latest logged outcome per company.
    const retryIds = retries.map((c) => c.id);
    const lastOutcome = new Map<string, string>();
    if (retryIds.length > 0) {
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
            inArray(interaction.companyId, retryIds),
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
      kind: "follow_up" | "no_contact_retry" | "touch_base";
    };

    const due: Reminder[] = [];
    const upcoming: Reminder[] = [];

    for (const c of explicit) {
      const dueDate = c.followUpDate as string;
      const row: Reminder = {
        id: c.id,
        name: c.name,
        city: c.city,
        industryPrimary: c.industryPrimary,
        priorityScore: c.priorityScore,
        lastTouchDate: c.lastTouchDate,
        dueDate,
        note: c.followUpNote,
        kind: "follow_up",
      };
      if (dueDate <= today) due.push(row);
      else upcoming.push(row);
    }

    for (const c of retries) {
      const dueDate = c.retryDate as string;
      const last = lastOutcome.get(c.id);
      const row: Reminder = {
        id: c.id,
        name: c.name,
        city: c.city,
        industryPrimary: c.industryPrimary,
        priorityScore: c.priorityScore,
        lastTouchDate: c.lastTouchDate,
        dueDate,
        note: last ? (outcomeMeta(last)?.label ?? null) : null,
        kind: "no_contact_retry",
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
          kind: "touch_base",
        });
      }
    }

    // Promises first, then No-Contact Retries, then customer check-ins; by date
    // within each.
    const kindRank = { follow_up: 0, no_contact_retry: 1, touch_base: 2 } as const;
    const order = (a: Reminder, b: Reminder) =>
      kindRank[a.kind] - kindRank[b.kind] || a.dueDate.localeCompare(b.dueDate);
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
      .select({ settings: distributor.settings })
      .from(distributor)
      .where(eq(distributor.id, distributorId))
      .limit(1);
    const settings = mergeSettings(distRow?.settings);
    const cadences = settings.cadence;

    // Decide where this company goes next. The two follow-up types:
    //  · rep-set promise (followUpDays) → Follow-up Queue, highest priority
    //  · No-Contact Retry (1st no-contact) → Follow-up Queue, due in retryDays
    // After a 2nd consecutive no-contact the company is PARKED (a future
    // next-eligible date) and re-enters the cold queue — at the back — once the
    // cooldown passes. Reaching a person (gatekeeper / DM) or flagging an
    // opportunity resets the no-contact counter.
    const prev = target.noContactAttempts ?? 0;
    let nextEligibleDate: string | null = null; // null ⇒ eligible now (cold queue)
    let retryDate: string | null = null;
    let noContactAttempts = prev;
    let followUpDate: string | null = null;
    let followUpNote: string | null = null;
    let bumpQueue = false; // reset queue position → send to the back on rest/park

    if (input.remove) {
      noContactAttempts = 0;
    } else if (input.followUpDays != null) {
      // Rep-set promise — leaves the cold queue for the Follow-up Queue.
      followUpDate = addDaysISO(input.followUpDays);
      followUpNote = note || null;
      noContactAttempts = 0;
    } else if (input.opportunity) {
      // Becomes an opportunity (lifecycle set below) — leaves the cold queue.
      noContactAttempts = 0;
    } else if (input.outcome === "no_answer" || input.outcome === "voicemail") {
      const attempts = prev + 1;
      if (attempts >= 2) {
        // Second strike → park, then re-enter the cold queue after the cooldown.
        nextEligibleDate = addDaysISO(settings.retry.parkDays);
        noContactAttempts = 0;
        bumpQueue = true;
      } else {
        // First strike → No-Contact Retry in the Follow-up Queue.
        retryDate = addDaysISO(settings.retry.retryDays);
        noContactAttempts = 1;
      }
    } else if (input.outcome === "gatekeeper" || input.outcome === "decision_maker") {
      // Reached a person — rests via the outcome's cadence, then re-enters the
      // cold queue at the back. (A rep who sets a follow-up chip takes the
      // promise branch above instead.)
      const cadKey: CadenceKey =
        input.outcome === "decision_maker" && input.notInterested
          ? "not_interested"
          : input.outcome;
      const cadence = cadences[cadKey] ?? null;
      nextEligibleDate = cadence == null ? null : addDaysISO(cadence);
      noContactAttempts = 0;
      if (nextEligibleDate) bumpQueue = true;
    } else if (input.outcome === "wrong_number") {
      // Data-quality outcome — parked far out until the number is corrected; not
      // a no-contact strike, so the counter is left untouched.
      nextEligibleDate = addDaysISO(3650);
      bumpQueue = true;
    }

    const patch: Partial<typeof company.$inferInsert> = {
      lastTouchDate: todayISO(),
      nextEligibleDate,
      retryDate,
      noContactAttempts,
      followUpDate,
      followUpNote,
      updatedAt: new Date(),
    };
    if (bumpQueue) patch.queuedAt = new Date();
    if (input.opportunity) patch.lifecycleState = "opp";
    if (input.remove) patch.suppressed = input.remove;

    await db.update(company).set(patch).where(eq(company.id, input.companyId));

    return row.id;
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
