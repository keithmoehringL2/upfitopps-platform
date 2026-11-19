import { and, eq } from "drizzle-orm";
import { getDb } from "./client";
import { company, distributor } from "./schema";
import type { AuthContext } from "../auth/context";
import { isManufacturerRole } from "../auth/context";

/**
 * The ONLY sanctioned way to read tenant data.
 *
 * Every method takes an AuthContext and injects the tenant predicate into the
 * query itself (default-deny). There is deliberately no exported raw-query
 * helper — new code must go through here so a tenant scope can never be
 * forgotten. See BUILD_PLAN_architecture_and_security.md §7–§8.
 */

export class ForbiddenError extends Error {}

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
};
