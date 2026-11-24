// Seed the database with dev fixtures. Idempotent (fixed UUIDs + onConflict).
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/seed.ts
import { and, eq, notInArray, sql } from "drizzle-orm";
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

// Dev-only passwords for the seeded manager, L2 admin and manufacturer users.
const DEMO_MANAGER_PASSWORD = "upfit1234";
const DEMO_ADMIN_PASSWORD = "upfit1234";
const DEMO_MFR_PASSWORD = "upfit1234";

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
    .values({ id: ID.program, manufacturerId: ID.mfr, name: "Adrian Steel VIO", code: "AS-VIO-F26" })
    .onConflictDoNothing();
  // Ensure the program code is set on re-seed (used by CSV program_code).
  await db.update(manufacturerProgram).set({ code: "AS-VIO-F26" }).where(eq(manufacturerProgram.id, ID.program));

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
      { id: ID.admin, email: "admin@l2-digital.test", name: "Ryan Patel", role: "l2_admin" },
      { id: ID.mgrTruck, email: "manager@truckcolors.test", name: "Dana Reyes", role: "manager", distributorId: ID.distTruck },
      { id: ID.rep1, email: "rep1@truckcolors.test", name: "Alex Rivera", role: "rep", distributorId: ID.distTruck, dailyTarget: 20 },
      { id: ID.rep2, email: "rep2@demo.test", name: "Sam Lee", role: "rep", distributorId: ID.distDemo, dailyTarget: 10 },
      { id: ID.mfrRegional, email: "regional@adriansteel.test", name: "Mike Turner", role: "mfr_regional", manufacturerId: ID.mfr },
      { id: ID.mfrLeader, email: "skim@adriansteel.test", name: "Sarah Kim", role: "mfr_leadership", manufacturerId: ID.mfr },
    ])
    .onConflictDoNothing();

  // Backfill display names on re-seed (onConflictDoNothing above skips existing).
  for (const [id, name] of [
    [ID.admin, "Ryan Patel"],
    [ID.mgrTruck, "Dana Reyes"],
    [ID.rep1, "Alex Rivera"],
    [ID.rep2, "Sam Lee"],
    [ID.mfrRegional, "Mike Turner"],
    [ID.mfrLeader, "Sarah Kim"],
  ] as const) {
    await db.update(user).set({ name }).where(eq(user.id, id));
  }

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
        address: "4100 N Lamar Blvd",
        city: "Austin",
        state: "TX",
        zip: "78701",
        phone: "(512) 555-0131",
        website: "northsideplumbing.com",
        industryPrimary: "Plumbing",
        description: "Residential + light-commercial plumbing with a growing service-van fleet.",
        totalVehicles: 18,
        truckCount: 6,
        vanCount: 12,
        fleetMix: "Ford Transit ×12 · F-250 ×6",
        priorityScore: "4.6",
        priorityExplanation: "Large van fleet, strong upfit fit.",
        latitude: 30.2729,
        longitude: -97.7444,
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
        latitude: 30.2615,
        longitude: -97.721,
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
        truckCount: 4,
        vanCount: 10,
        fleetMix: "Ford Transit ×10 · F-250 ×4",
        priorityScore: "4.2",
        priorityExplanation: "Large fleet, high upfit fit, no recent contact.",
        latitude: 30.266,
        longitude: -97.715,
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
        truckCount: 6,
        vanCount: 3,
        fleetMix: "F-250 ×6 · Transit ×3",
        latitude: 30.5083,
        longitude: -97.6789,
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
        truckCount: 4,
        vanCount: 2,
        fleetMix: "F-350 ×4 · Transit ×2",
        latitude: 30.362,
        longitude: -97.976,
        priorityScore: "2.4",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        lastTouchDate: daysFromNow(-9),
        nextEligibleDate: daysFromNow(5),
        // Rep-set follow-up that is overdue — shows in Follow Ups, past due.
        followUpDate: daysFromNow(-2),
        followUpNote: "Owner asked me to call back after their busy season.",
        followUpSource: "rep",
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
        truckCount: 2,
        vanCount: 9,
        fleetMix: "Transit Connect ×9 · F-150 ×2",
        latitude: 30.4394,
        longitude: -97.62,
        priorityScore: "3.6",
        priorityExplanation: "Strong fleet size and territory match.",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        // Rep-set follow-up a few days out — shows under Upcoming.
        followUpDate: daysFromNow(3),
        followUpNote: "Decision-maker is travelling; reconnect next week.",
        followUpSource: "rep",
      },
      {
        id: ID.co8,
        distributorId: ID.distTruck,
        externalImportId: "TC-008",
        name: "Riverbend Concrete",
        address: "1201 S Congress Ave",
        city: "Austin",
        state: "TX",
        zip: "78704",
        phone: "(512) 555-0150",
        industryPrimary: "Construction",
        totalVehicles: 15,
        truckCount: 11,
        vanCount: 4,
        fleetMix: "F-350 ×11 · Transit ×4",
        priorityScore: "3.4",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        // Parked after reaching the attempts threshold — absent from both
        // queues until the park duration passes.
        lastTouchDate: daysFromNow(-3),
        nextEligibleDate: daysFromNow(45),
        attemptCount: 0,
      },
      {
        id: ID.co9,
        distributorId: ID.distTruck,
        externalImportId: "TC-009",
        name: "Summit Mechanical",
        address: "640 Research Blvd",
        city: "Austin",
        state: "TX",
        zip: "78759",
        phone: "(512) 555-0177",
        industryPrimary: "HVAC",
        totalVehicles: 13,
        truckCount: 3,
        vanCount: 10,
        fleetMix: "Transit ×10 · F-250 ×3",
        priorityScore: "3.9",
        ownerUserId: ID.rep1,
        sourceProgramId: ID.program,
        // One no-answer logged — a system-assigned follow-up now due/overdue.
        lastTouchDate: daysFromNow(-4),
        followUpDate: daysFromNow(-1),
        followUpSource: "system",
        attemptCount: 1,
      },
      {
        id: ID.co10,
        distributorId: ID.distTruck,
        externalImportId: "TC-010",
        name: "Cedar Park Catering",
        address: "900 E Whitestone Blvd",
        city: "Cedar Park",
        state: "TX",
        zip: "78613",
        phone: "(512) 555-0188",
        industryPrimary: "Food Service",
        totalVehicles: 5,
        truckCount: 1,
        vanCount: 4,
        fleetMix: "Transit ×4 · F-150 ×1",
        priorityScore: "2.1",
        ownerUserId: ID.rep1,
        // A past customer on a recurring check-in — shows in the Customers card,
        // due now (last touch older than the interval).
        lifecycleState: "customer",
        touchIntervalDays: 30,
        lastTouchDate: daysFromNow(-45),
      },
    ])
    // Upsert so re-seeding refreshes fixtures (and resets cadence/lifecycle
    // state that manual testing may have changed).
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
        latitude: sql`excluded.latitude`,
        longitude: sql`excluded.longitude`,
        placeId: sql`excluded.place_id`,
        ownerUserId: sql`excluded.owner_user_id`,
        sourceProgramId: sql`excluded.source_program_id`,
        lastTouchDate: sql`excluded.last_touch_date`,
        nextEligibleDate: sql`excluded.next_eligible_date`,
        followUpDate: sql`excluded.follow_up_date`,
        followUpNote: sql`excluded.follow_up_note`,
        followUpSource: sql`excluded.follow_up_source`,
        retryDate: sql`excluded.retry_date`,
        attemptCount: sql`excluded.no_contact_attempts`,
        touchIntervalDays: sql`excluded.touch_interval_days`,
        lifecycleState: sql`excluded.lifecycle_state`,
        suppressed: sql`excluded.suppressed`,
        updatedAt: new Date(),
      },
    });

  // Set the demo manager's password (update so re-seeding refreshes it even
  // though the user row already exists via onConflictDoNothing).
  await db
    .update(user)
    .set({ passwordHash: await hashPassword(DEMO_MANAGER_PASSWORD) })
    .where(eq(user.id, ID.mgrTruck));

  // L2 admin password (admin.<root>/login).
  await db
    .update(user)
    .set({ passwordHash: await hashPassword(DEMO_ADMIN_PASSWORD) })
    .where(eq(user.id, ID.admin));

  // Manufacturer portal passwords (portal.<root>/login): regional + leadership.
  const mfrHash = await hashPassword(DEMO_MFR_PASSWORD);
  await db.update(user).set({ passwordHash: mfrHash }).where(eq(user.id, ID.mfrRegional));
  await db.update(user).set({ passwordHash: mfrHash }).where(eq(user.id, ID.mfrLeader));

  // Demo-friendly daily goal so the queue's progress bar is meaningful.
  await db.update(user).set({ dailyTarget: 8 }).where(eq(user.id, ID.rep1));

  // A little history on Northside Plumbing so the detail view isn't empty.
  const northsideActivity = [
    {
      id: ID.int1,
      distributorId: ID.distTruck,
      companyId: ID.co1,
      repUserId: ID.rep1,
      channel: "call" as const,
      outcome: "decision_maker" as const,
      note: "Spoke with the owner — interested in van shelving for 3 trucks. Sending info.",
      createdAt: dateDaysAgo(6),
    },
    {
      id: ID.int2,
      distributorId: ID.distTruck,
      companyId: ID.co1,
      repUserId: ID.rep1,
      channel: "call" as const,
      outcome: "voicemail" as const,
      note: "Left a voicemail following up on the shelving quote.",
      createdAt: dateDaysAgo(2),
    },
    {
      // First no-contact on Summit Mechanical — gives the No-Contact Retry row
      // its activity context ("Left Voicemail").
      id: ID.int3,
      distributorId: ID.distTruck,
      companyId: ID.co9,
      repUserId: ID.rep1,
      channel: "call" as const,
      outcome: "voicemail" as const,
      note: "Left a voicemail; no callback yet.",
      createdAt: dateDaysAgo(4),
    },
  ];
  await db
    .insert(interaction)
    .values(northsideActivity)
    .onConflictDoUpdate({
      target: interaction.id,
      set: { outcome: sql`excluded.outcome`, note: sql`excluded.note`, createdAt: sql`excluded.created_at` },
    });

  // Drop any ad-hoc interactions left on the demo company from manual testing,
  // so the seeded history stays clean and uses the canonical outcome set.
  await db
    .delete(interaction)
    .where(
      and(eq(interaction.companyId, ID.co1), notInArray(interaction.id, [ID.int1, ID.int2])),
    );

  console.log("✓ seed complete");
  console.log(`  demo manager: manager@truckcolors.test / ${DEMO_MANAGER_PASSWORD}`);
  console.log("  demo rep:     rep1@truckcolors.test (passwordless)");
  console.log(`  demo admin:   admin@l2-digital.test / ${DEMO_ADMIN_PASSWORD} (admin.localhost:3000)`);
  console.log(`  demo mfr:     regional@adriansteel.test · skim@adriansteel.test / ${DEMO_MFR_PASSWORD} (portal.localhost:3000)`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
