// Seed the database with dev fixtures. Idempotent (fixed UUIDs + onConflict).
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/seed.ts
import { getDb } from "../lib/db/client";
import {
  company,
  distributor,
  manufacturer,
  manufacturerProgram,
  programDistributor,
  user,
} from "../lib/db/schema";
import { SEED_IDS as ID } from "./seed-ids";

async function main() {
  const db = getDb();

  await db
    .insert(manufacturer)
    .values({ id: ID.mfr, name: "Adrian Steel" })
    .onConflictDoNothing();

  await db
    .insert(manufacturerProgram)
    .values({ id: ID.program, manufacturerId: ID.mfr, name: "Adrian Steel VIO" })
    .onConflictDoNothing();

  await db
    .insert(distributor)
    .values([
      { id: ID.distTruck, slug: "truckcolors", name: "Truck Colors", primaryColor: "#1d4ed8" },
      { id: ID.distDemo, slug: "demo", name: "Demo Distributor", primaryColor: "#c8102e" },
    ])
    .onConflictDoNothing();

  await db
    .insert(user)
    .values([
      { id: ID.mgrTruck, email: "manager@truckcolors.test", role: "manager", distributorId: ID.distTruck },
      { id: ID.rep1, email: "rep1@truckcolors.test", role: "rep", distributorId: ID.distTruck, dailyTarget: 20 },
      { id: ID.rep2, email: "rep2@demo.test", role: "rep", distributorId: ID.distDemo, dailyTarget: 10 },
      { id: ID.mfrRegional, email: "regional@adriansteel.test", role: "mfr_regional", manufacturerId: ID.mfr },
    ])
    .onConflictDoNothing();

  await db
    .insert(programDistributor)
    .values({
      id: ID.progDist,
      programId: ID.program,
      distributorId: ID.distTruck,
      regionalRepUserId: ID.mfrRegional,
    })
    .onConflictDoNothing();

  await db
    .insert(company)
    .values([
      {
        id: ID.co1,
        distributorId: ID.distTruck,
        externalImportId: "TC-001",
        name: "Northside Plumbing",
        city: "Austin",
        zip: "78701",
        industryPrimary: "Plumbing",
        priorityScore: "4.6",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
      },
      {
        id: ID.co2,
        distributorId: ID.distTruck,
        externalImportId: "TC-002",
        name: "Lone Star HVAC",
        city: "Austin",
        zip: "78702",
        industryPrimary: "HVAC",
        priorityScore: "3.8",
        ownerUserId: null,
        sourceProgramId: ID.program,
      },
      {
        id: ID.co3,
        distributorId: ID.distDemo,
        externalImportId: "DM-001",
        name: "Acme Electrical",
        city: "Dallas",
        zip: "75201",
        industryPrimary: "Electrical",
        priorityScore: "2.9",
        ownerUserId: ID.rep2,
      },
    ])
    .onConflictDoNothing();

  console.log("✓ seed complete");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
