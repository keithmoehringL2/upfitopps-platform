import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "./client";
import { company, distributor, interaction, user } from "./schema";
import type { AuthContext } from "../auth/context";
import { isManufacturerRole } from "../auth/context";
import {
  outcomeMeta,
  type ChannelValue,
  type OutcomeValue,
} from "../rep/outcomes";

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
          isNull(company.suppressed),
        ),
      )
      .orderBy(
        dueRank,
        sql`${company.priorityScore} desc nulls last`,
        company.name,
      );
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
      channel: ChannelValue;
      outcome: OutcomeValue;
      note?: string | null;
    },
  ) {
    const distributorId = requireDistributorScope(ctx);
    const target = await this.getCompanyInScope(ctx, input.companyId);
    if (!target) {
      throw new NotFoundError("Company not found in scope");
    }

    const meta = outcomeMeta(input.outcome);
    if (!meta) throw new ForbiddenError(`Unknown outcome ${input.outcome}`);

    const db = getDb();
    const [row] = await db
      .insert(interaction)
      .values({
        distributorId,
        companyId: input.companyId,
        repUserId: ctx.userId,
        channel: input.channel,
        outcome: input.outcome,
        note: input.note?.trim() || null,
      })
      .returning({ id: interaction.id });

    // Apply cadence + lifecycle side-effects.
    const patch: Partial<typeof company.$inferInsert> = {
      lastTouchDate: todayISO(),
      nextEligibleDate: meta.suppress ? null : addDaysISO(meta.nextDays ?? 7),
      updatedAt: new Date(),
    };
    if (meta.lifecycle) patch.lifecycleState = meta.lifecycle;
    if (meta.suppress) patch.suppressed = meta.suppress;

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
};
