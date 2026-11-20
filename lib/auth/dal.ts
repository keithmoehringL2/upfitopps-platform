import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "./session";
import type { AuthContext, Role } from "./context";

// Data Access Layer: the one place pages/actions resolve the current user and
// its AuthContext. `cache` dedupes the session lookup within a render pass.
export const getCurrentUser = cache(getSessionUser);

export async function getAuthContext(): Promise<AuthContext | null> {
  const u = await getCurrentUser();
  if (!u) return null;
  return {
    userId: u.id,
    role: u.role,
    distributorId: u.distributorId,
    manufacturerId: u.manufacturerId,
    programIds: [],
  };
}

/** Require a signed-in user of one of the given roles, or redirect to /login. */
export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx || (roles.length > 0 && !roles.includes(ctx.role))) {
    redirect("/login");
  }
  return ctx;
}

/** Require a signed-in rep, or redirect to the rep's own passwordless sign-in. */
export async function requireRep(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") {
    redirect("/rep/login");
  }
  return ctx;
}
