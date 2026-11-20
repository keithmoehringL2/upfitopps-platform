import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  doublePrecision,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Phase 1 foundation schema. Tenancy, users, sessions, companies and the audit
 * log — enough to enforce and prove tenant + manufacturer isolation. Later
 * phases add activity events, queues, opportunities/quotes, candidates, the
 * confirmed decision-maker, and import batches (see
 * BUILD_PLAN_architecture_and_security.md §4).
 *
 * Every tenant-owned table carries distributor_id. Manufacturer attribution
 * flows through company.source_program_id (immutable) so a VIO prospect that
 * later becomes a customer never widens manufacturer visibility (§8).
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const roleEnum = pgEnum("role", [
  "l2_admin",
  "manager",
  "rep",
  "mfr_regional",
  "mfr_leadership",
]);

export const accountStatusEnum = pgEnum("account_status", [
  "active",
  "paused",
  "disabled",
]);

export const companyStateEnum = pgEnum("company_state", [
  "cold",
  "customer",
  "opp",
]);

export const suppressionEnum = pgEnum("suppression_kind", ["remove", "dnc"]);

export const verifyPurposeEnum = pgEnum("verify_purpose", [
  "rep_device_verify",
  "password_reset",
]);

// How a rep touched a prospect, and what came of it. Outcomes drive the cadence
// engine (next-eligible date) and some lifecycle/suppression transitions; see
// lib/rep/outcomes.ts.
export const interactionChannelEnum = pgEnum("interaction_channel", [
  "call",
  "email",
  "text",
  "visit",
]);

export const interactionOutcomeEnum = pgEnum("interaction_outcome", [
  // Original placeholder set (kept so the enum change is purely additive).
  "connected",
  "left_message",
  "no_answer",
  "callback",
  "meeting_set",
  "not_interested",
  "do_not_contact",
  "bad_contact",
  // Canonical call outcomes from the design handoff (see lib/rep/outcomes.ts).
  "voicemail",
  "gatekeeper",
  "decision_maker",
  "wrong_number",
]);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------
export const distributor = pgTable(
  "distributor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    primaryColor: text("primary_color").notNull().default("#c8102e"),
    logoUrl: text("logo_url"),
    status: accountStatusEnum("status").notNull().default("active"),
    // cadence intervals, email schedule, leaderboard on/off, default targets
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("distributor_slug_uq").on(t.slug)],
);

export const manufacturer = pgTable("manufacturer", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: accountStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manufacturerProgram = pgTable("manufacturer_program", {
  id: uuid("id").primaryKey().defaultRandom(),
  manufacturerId: uuid("manufacturer_id")
    .notNull()
    .references(() => manufacturer.id),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Users, sessions, verification tokens
// ---------------------------------------------------------------------------
export const user = pgTable(
  "app_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    role: roleEnum("role").notNull(),
    // null for L2 admins and manufacturer users
    distributorId: uuid("distributor_id").references(() => distributor.id),
    // null for L2 admins and distributor users
    manufacturerId: uuid("manufacturer_id").references(() => manufacturer.id),
    // reps have no password (passwordless email flow)
    passwordHash: text("password_hash"),
    status: accountStatusEnum("status").notNull().default("active"),
    dailyTarget: integer("daily_target"),
    dailyEmailEnabled: boolean("daily_email_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // email is unique within a distributor; manufacturer/L2 users are scoped
    // separately in app logic. Partial-uniqueness is refined in a later phase.
    uniqueIndex("user_distributor_email_uq").on(t.distributorId, t.email),
    index("user_email_idx").on(t.email),
  ],
);

export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("session_token_hash_uq").on(t.tokenHash),
    index("session_user_idx").on(t.userId),
  ],
);

export const emailVerificationToken = pgTable(
  "email_verification_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    tokenHash: text("token_hash").notNull(),
    purpose: verifyPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("verify_token_hash_uq").on(t.tokenHash)],
);

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributor.id),
    // stable per-distributor upsert key from the prepared CSV
    externalImportId: text("external_import_id"),

    name: text("name").notNull(),
    legalName: text("legal_name"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    website: text("website"),
    phone: text("phone"),
    industryPrimary: text("industry_primary"),
    industrySub: text("industry_sub"),
    description: text("description"),

    totalVehicles: integer("total_vehicles"),
    truckCount: integer("truck_count"),
    vanCount: integer("van_count"),
    fleetMix: jsonb("fleet_mix"),
    priorityScore: numeric("priority_score", { precision: 2, scale: 1 }),
    priorityExplanation: text("priority_explanation"),

    // IMMUTABLE manufacturer attribution — the VIO program this company came
    // from (null for distributor-sourced). Reporting scopes to this. Never
    // overwritten after insert.
    sourceProgramId: uuid("source_program_id").references(
      () => manufacturerProgram.id,
    ),

    lifecycleState: companyStateEnum("lifecycle_state").notNull().default("cold"),
    suppressed: suppressionEnum("suppressed"),
    nextEligibleDate: date("next_eligible_date"),
    touchIntervalDays: integer("touch_interval_days"),
    lastTouchDate: date("last_touch_date"),
    ownerUserId: uuid("owner_user_id").references(() => user.id),

    // Confirmed primary decision-maker (jsonb: name/title/phone/email/notes) and
    // number of quotes recorded — captured on the rep Company Detail screen.
    decisionMaker: jsonb("decision_maker"),
    decisionMakerAt: timestamp("decision_maker_at", { withTimezone: true }),
    quoteCount: integer("quote_count").notNull().default(0),

    // Geocoding resolved during data prep (Google Place ID + coordinates) so the
    // ZIP map can drop pins without the app geocoding messy addresses.
    placeId: text("place_id"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("company_distributor_external_uq").on(
      t.distributorId,
      t.externalImportId,
    ),
    index("company_distributor_idx").on(t.distributorId),
    index("company_owner_idx").on(t.ownerUserId),
    index("company_zip_idx").on(t.distributorId, t.zip),
  ],
);

// ---------------------------------------------------------------------------
// Interactions (logged rep activity)
// ---------------------------------------------------------------------------
export const interaction = pgTable(
  "interaction",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributor.id),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id),
    repUserId: uuid("rep_user_id")
      .notNull()
      .references(() => user.id),
    channel: interactionChannelEnum("channel").notNull().default("call"),
    outcome: interactionOutcomeEnum("outcome").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("interaction_company_idx").on(t.companyId),
    index("interaction_rep_idx").on(t.repUserId),
    index("interaction_distributor_created_idx").on(t.distributorId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Program ↔ distributor assignment (manufacturer scoping)
// ---------------------------------------------------------------------------
export const programDistributor = pgTable(
  "program_distributor",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id")
      .notNull()
      .references(() => manufacturerProgram.id),
    distributorId: uuid("distributor_id")
      .notNull()
      .references(() => distributor.id),
    // the manufacturer regional rep allowed to view this program-distributor
    regionalRepUserId: uuid("regional_rep_user_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("program_distributor_uq").on(t.programId, t.distributorId),
  ],
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    distributorId: uuid("distributor_id").references(() => distributor.id),
    actorUserId: uuid("actor_user_id").references(() => user.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_distributor_idx").on(t.distributorId)],
);
