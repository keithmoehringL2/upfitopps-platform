import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

// Neon's serverless driver needs a WebSocket implementation in Node (Vercel's
// Node runtime and local dev). We use the Pool driver so multi-statement
// transactions (CSV import, outcome writes) are available.
if (typeof (globalThis as unknown as { WebSocket?: unknown }).WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export type Db = NeonDatabase<typeof schema>;

let _db: Db | null = null;

// Lazy singleton so importing this module never throws at build/prerender time
// when DATABASE_URL is absent — it only fails when a query is actually issued.
export function getDb(): Db {
  if (_db) return _db;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon Postgres and set it in .env.local (and in Vercel).",
    );
  }
  const pool = new Pool({ connectionString });
  _db = drizzle(pool, { schema });
  return _db;
}
