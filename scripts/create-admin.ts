// One-off bootstrap: create (or reset the password for) a single L2 admin in
// whatever database DATABASE_URL points at. Intended to seed the FIRST admin in
// production — it inserts NO demo data.
//
// Credentials come from the environment so they never hit your shell history.
// Put them in a gitignored env file alongside the production DATABASE_URL
// (e.g. .env.production.local), run the script, then delete the two admin lines:
//
//   DATABASE_URL=postgres://...PROD...
//   ADMIN_EMAIL=you@l2-digital.com
//   ADMIN_PASSWORD=a-long-password
//   ADMIN_NAME=Your Name           # optional
//
//   npm run admin:create
//
// Idempotent: re-running with the same email resets that admin's password.
import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { user } from "../lib/db/schema";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  const name = (process.env.ADMIN_NAME ?? "").trim() || null;

  if (!email.includes("@")) {
    console.error("Set ADMIN_EMAIL to a valid email address.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Set ADMIN_PASSWORD to at least 8 characters.");
    process.exit(1);
  }

  const db = getDb();
  const passwordHash = await hashPassword(password);

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.email, email), eq(user.role, "l2_admin")))
    .limit(1);

  if (existing) {
    await db
      .update(user)
      .set({ passwordHash, name, status: "active", updatedAt: new Date() })
      .where(eq(user.id, existing.id));
    console.log(`✓ Reset password for existing L2 admin ${email}.`);
  } else {
    await db.insert(user).values({ email, name, role: "l2_admin", status: "active", passwordHash });
    console.log(`✓ Created L2 admin ${email}.`);
  }
  console.log("  Sign in at admin.<your-root-domain>/login");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
