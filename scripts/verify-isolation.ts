// Proves the tenant + manufacturer isolation boundary against the seeded DB.
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/verify-isolation.ts
import { data, ForbiddenError } from "../lib/db/gateway";
import type { AuthContext, Role } from "../lib/auth/context";
import { SEED_IDS as ID } from "./seed-ids";

function ctx(partial: Partial<AuthContext> & { role: Role }): AuthContext {
  return {
    userId: "",
    distributorId: null,
    manufacturerId: null,
    programIds: [],
    ...partial,
  };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log("  PASS  " + name);
  } else {
    fail++;
    console.log("  FAIL  " + name);
  }
}

async function main() {
  // Manager sees every company in their distributor — and only theirs.
  const mgr = ctx({ userId: ID.mgrTruck, role: "manager", distributorId: ID.distTruck });
  const mgrCompanies = await data.listCompanies(mgr);
  const mgrIds = new Set(mgrCompanies.map((c) => c.id));
  check(
    "manager sees every truckcolors company (incl. co1 & co2)",
    mgrIds.has(ID.co1) && mgrIds.has(ID.co2) && mgrCompanies.length >= 2,
  );
  check(
    "manager sees nothing outside their distributor",
    mgrCompanies.every((c) => c.distributorId === ID.distTruck),
  );

  // Rep sees only companies they own — not even unowned ones in their tenant.
  const rep = ctx({ userId: ID.rep1, role: "rep", distributorId: ID.distTruck });
  const repCompanies = await data.listCompanies(rep);
  check(
    "rep sees only companies they own",
    repCompanies.length > 0 && repCompanies.every((c) => c.ownerUserId === ID.rep1),
  );
  check(
    "rep does NOT see an unowned company in their tenant (co2)",
    !repCompanies.some((c) => c.id === ID.co2),
  );

  // Cross-tenant: a manager scoped to demo cannot see truckcolors data.
  const demoMgr = ctx({ userId: "x", role: "manager", distributorId: ID.distDemo });
  const demoCompanies = await data.listCompanies(demoMgr);
  check(
    "demo manager sees only demo's company",
    demoCompanies.length === 1 && demoCompanies[0].distributorId === ID.distDemo,
  );

  // Manufacturer roles can never read company records.
  let regionalDenied = false;
  try {
    await data.listCompanies(
      ctx({ userId: ID.mfrRegional, role: "mfr_regional", manufacturerId: ID.mfr }),
    );
  } catch (e) {
    regionalDenied = e instanceof ForbiddenError;
  }
  check("manufacturer regional denied company read", regionalDenied);

  let leadershipDenied = false;
  try {
    await data.listCompanies(ctx({ userId: "y", role: "mfr_leadership", manufacturerId: ID.mfr }));
  } catch (e) {
    leadershipDenied = e instanceof ForbiddenError;
  }
  check("manufacturer leadership denied company read", leadershipDenied);

  // L2 admin must scope explicitly — the broad context is denied.
  let l2Denied = false;
  try {
    await data.listCompanies(ctx({ userId: "z", role: "l2_admin" }));
  } catch (e) {
    l2Denied = e instanceof ForbiddenError;
  }
  check("l2 admin denied unscoped company read", l2Denied);

  // Brand/host resolution.
  const d = await data.getDistributorBySlug("truckcolors");
  check("slug resolves to the right distributor", !!d && d.name === "Truck Colors");
  const missing = await data.getDistributorBySlug("does-not-exist");
  check("unknown slug resolves to null", missing === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
