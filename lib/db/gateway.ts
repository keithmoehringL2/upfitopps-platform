import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import { company, distributor, interaction, session, user } from "./schema";
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
   * A rep's work queue: the companies they own, minus suppressed ones, with the
   * due ones (never touched, or next-eligible on/before today) floated to the
   * top, then by priority score, then name.
   */
  async listRepQueue(ctx: AuthContext) {
    const distributorId = requireDistributorScope(ctx);
    if (ctx.role !== "rep") {
      throw new ForbiddenError("listRepQueue is for reps");
    }
    const db = getDb();
    const today = todayISO();
    const dueRank = sql`case when ${company.nextEligibleDate} is null or ${company.nextEligibleDate} <= ${today} then 0 else 1 end`;
    return db
      .select()
      .from(company)
      .where(
        and(
          eq(company.distributorId, distributorId),
          eq(company.ownerUserId, ctx.userId),
          eq(company.lifecycleState, "cold"), // opportunities leave the cold queue
          isNull(company.suppressed),
          // Companies with an explicit follow-up pending are handled by the
          // Follow-up Reminders flow, not the routine cold queue.
          isNull(company.followUpDate),
        ),
      )
      .orderBy(
        dueRank,
        sql`${company.priorityScore} desc nulls last`,
        company.name,
      );
  },

  /**
   * Follow-up reminders for a rep: explicit follow-ups they set (due today or
   * overdue, plus a dated "upcoming" list) and customer touch-base reminders.
   * These are separate from the cold queue and never count toward the daily
   * goal. Reps only; scoped to companies they own.
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
      touchIntervalDays: company.touchIntervalDays,
      lifecycleState: company.lifecycleState,
    };

    const base = and(
      eq(company.distributorId, distributorId),
      eq(company.ownerUserId, ctx.userId),
      isNull(company.suppressed),
    );

    const [explicit, customers] = await Promise.all([
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

    type Reminder = {
      id: string;
      name: string;
      city: string | null;
      industryPrimary: string | null;
      priorityScore: string | null;
      lastTouchDate: string | null;
      dueDate: string;
      note: string | null;
      kind: "follow_up" | "touch_base";
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

    due.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
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

    // Resolve the next-eligible date: explicit follow-up wins; else the
    // distributor's configured cadence for this outcome (Decision-Maker +
    // not-interested uses the not-interested setting). A null cadence means no
    // follow-up — the prospect is parked far out.
    const [distRow] = await db
      .select({ settings: distributor.settings })
      .from(distributor)
      .where(eq(distributor.id, distributorId))
      .limit(1);
    const cadences = mergeSettings(distRow?.settings).cadence;
    const cadKey: CadenceKey =
      input.outcome === "decision_maker" && input.notInterested
        ? "not_interested"
        : (input.outcome as CadenceKey);
    const cadence = cadences[cadKey] ?? null;
    const nextEligibleDate = input.remove
      ? null
      : input.followUpDays != null
        ? addDaysISO(input.followUpDays)
        : cadence == null
          ? addDaysISO(3650)
          : addDaysISO(cadence);

    const patch: Partial<typeof company.$inferInsert> = {
      lastTouchDate: todayISO(),
      nextEligibleDate,
      // An explicit follow-up moves the company out of the routine cold queue
      // and into Follow-up Reminders. Logging without choosing one clears any
      // prior reminder, so acting on a reminder resolves it.
      followUpDate: input.remove == null && input.followUpDays != null
        ? addDaysISO(input.followUpDays)
        : null,
      followUpNote: input.remove == null && input.followUpDays != null
        ? note || null
        : null,
      updatedAt: new Date(),
    };
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
