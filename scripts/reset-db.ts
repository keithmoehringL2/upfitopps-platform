// DANGER: drops and recreates the public schema. Dev only — wipes all data.
// Run: set -a; . ./.env.local; set +a; npx tsx scripts/reset-db.ts
import { sql } from "drizzle-orm";
import { getDb } from "../lib/db/client";

async function main() {
  const db = getDb();
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  console.log("✓ public schema reset");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
