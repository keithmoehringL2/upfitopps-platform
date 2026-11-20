// Seed the database with dev fixtures. Idempotent (fixed UUIDs + onConflict).
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/seed.ts
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import {
  company,
  distributor,
  interaction,
  manufacturer,
  manufacturerProgram,
  programDistributor,
  user,
} from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";
import { SEED_IDS as ID } from "./seed-ids";

// Dev-only password for the seeded manager so you can actually sign in.
const DEMO_MANAGER_PASSWORD = "upfit1234";

// Relative-date helpers so the seeded queue always has a realistic mix of
// due / not-yet-due prospects regardless of when you run it.
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number): string => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
const dateDaysAgo = (n: number): Date => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

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
      // More prospects for rep1's queue, with a realistic mix of due states.
      {
        id: ID.co4,
        distributorId: ID.distTruck,
        externalImportId: "TC-004",
        name: "Capital Metro Electric",
        address: "1400 E 6th St",
        city: "Austin",
        state: "TX",
        zip: "78702",
        phone: "(512) 555-0142",
        website: "capitalmetroelectric.com",
        industryPrimary: "Electrical",
        description: "Mid-size electrical contractor running a mixed van fleet; expanding crews this year.",
        totalVehicles: 14,
        priorityScore: "4.2",
        priorityExplanation: "Large fleet, high upfit fit, no recent contact.",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
      },
      {
        id: ID.co5,
        distributorId: ID.distTruck,
        externalImportId: "TC-005",
        name: "Bluebonnet Landscaping",
        address: "905 Round Rock Ave",
        city: "Round Rock",
        state: "TX",
        zip: "78681",
        phone: "(512) 555-0188",
        industryPrimary: "Landscaping",
        totalVehicles: 9,
        priorityScore: "3.1",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        lastTouchDate: daysFromNow(-4),
        nextEligibleDate: daysFromNow(-1), // due (yesterday)
      },
      {
        id: ID.co6,
        distributorId: ID.distTruck,
        externalImportId: "TC-006",
        name: "Hill Country Roofing",
        address: "220 Ranch Rd 620",
        city: "Austin",
        state: "TX",
        zip: "78734",
        phone: "(512) 555-0166",
        industryPrimary: "Roofing",
        totalVehicles: 6,
        priorityScore: "2.4",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        lastTouchDate: daysFromNow(-9),
        nextEligibleDate: daysFromNow(5), // not yet due
      },
      {
        id: ID.co7,
        distributorId: ID.distTruck,
        externalImportId: "TC-007",
        name: "Lone Oak Pest Control",
        address: "77 Pflugerville Pkwy",
        city: "Pflugerville",
        state: "TX",
        zip: "78660",
        phone: "(512) 555-0109",
        industryPrimary: "Pest Control",
        totalVehicles: 11,
        priorityScore: "3.6",
        priorityExplanation: "Strong fleet size and territory match.",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
      },
    ])
    .onConflictDoNothing();

  // Set the demo manager's password (update so re-seeding refreshes it even
  // though the user row already exists via onConflictDoNothing).
  await db
    .update(user)
    .set({ passwordHash: await hashPassword(DEMO_MANAGER_PASSWORD) })
    .where(eq(user.id, ID.mgrTruck));

  // Demo-friendly daily goal so the queue's progress bar is meaningful.
  await db.update(user).set({ dailyTarget: 8 }).where(eq(user.id, ID.rep1));

  // A little history on Northside Plumbing so the detail view isn't empty.
  await db
    .insert(interaction)
    .values([
      {
        id: ID.int1,
        distributorId: ID.distTruck,
        companyId: ID.co1,
        repUserId: ID.rep1,
        channel: "call",
        outcome: "connected",
        note: "Spoke with the owner — interested in van shelving for 3 trucks. Sending info.",
        createdAt: dateDaysAgo(6),
      },
      {
        id: ID.int2,
        distributorId: ID.distTruck,
        companyId: ID.co1,
        repUserId: ID.rep1,
        channel: "call",
        outcome: "left_message",
        note: "Left a voicemail following up on the shelving quote.",
        createdAt: dateDaysAgo(2),
      },
    ])
    .onConflictDoNothing();

  console.log("✓ seed complete");
  console.log(`  demo manager: manager@truckcolors.test / ${DEMO_MANAGER_PASSWORD}`);
  console.log("  demo rep:     rep1@truckcolors.test (passwordless)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
