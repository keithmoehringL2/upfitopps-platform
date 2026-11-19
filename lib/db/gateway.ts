import type { AuthContext } from "@/lib/auth/context";
import { isManufacturerRole } from "@/lib/auth/context";
import { SEED, type Company, type Distributor } from "./seed";

/**
 * The ONLY sanctioned way to read tenant data.
 *
 * Every method takes an AuthContext and injects the tenant predicate itself.
 * There is deliberately no exported "raw query" helper — new code must go
 * through this gateway so a tenant scope can never be forgotten (default-deny).
 *
 * When Postgres is wired in, replace the in-memory filters with parameterized
 * SQL that appends the same `distributor_id = ctx.distributorId` predicate, and
 * consider Postgres Row-Level Security as a second enforcement layer.
 * See BUILD_PLAN_architecture_and_security.md §7–§8.
 */

class ForbiddenError extends Error {}

function requireDistributorScope(ctx: AuthContext): string {
  if (isManufacturerRole(ctx.role)) {
    // Manufacturers get aggregate-only reporting through a separate read model
    // and must never reach company records.
    throw new ForbiddenError("Manufacturer users cannot read company records");
  }
  if (ctx.role === "l2_admin") {
    throw new ForbiddenError("L2 admin must target a specific distributor explicitly");
  }
  if (!ctx.distributorId) {
    throw new ForbiddenError("No distributor in auth context");
  }
  return ctx.distributorId;
}

export const data = {
  /** Public-ish lookup used by host routing to render a tenant's brand. */
  getDistributorBySlug(slug: string): Distributor | null {
    return SEED.distributors.find((d) => d.slug === slug) ?? null;
  },

  /**
   * Manager: every company in their distributor.
   * Rep: only companies they own.
   * Manufacturer / L2: denied here (wrong read model).
   */
  listCompanies(ctx: AuthContext): Company[] {
    const distributorId = requireDistributorScope(ctx);
    let rows = SEED.companies.filter((c) => c.distributorId === distributorId);
    if (ctx.role === "rep") {
      rows = rows.filter((c) => c.ownerId === ctx.userId);
    }
    return rows;
  },
};

export { ForbiddenError };
