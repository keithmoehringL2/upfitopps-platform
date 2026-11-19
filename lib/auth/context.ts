// The authenticated caller's authorization context. EVERY data-access call
// takes one of these so the tenant/manufacturer scope can never be forgotten.
// See lib/db/gateway.ts and BUILD_PLAN_architecture_and_security.md §7.

export type Role =
  | "l2_admin"
  | "manager"
  | "rep"
  | "mfr_regional"
  | "mfr_leadership";

export interface AuthContext {
  userId: string;
  role: Role;
  /** null for L2 admins and manufacturer users */
  distributorId: string | null;
  /** null for L2 admins and distributor users */
  manufacturerId: string | null;
  /** program ids this user may see (manufacturer scoping); empty otherwise */
  programIds: string[];
}

export function isDistributorRole(role: Role): boolean {
  return role === "manager" || role === "rep";
}

export function isManufacturerRole(role: Role): boolean {
  return role === "mfr_regional" || role === "mfr_leadership";
}
