import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` reads only the schema (no DB needed). `migrate`,
// `push` and `studio` use DATABASE_URL.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  verbose: true,
  strict: true,
});
