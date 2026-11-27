// One-off backfill: populate company.root_domain from company.website using the
// same rootDomain() logic the app uses on every write. Idempotent — safe to run
// repeatedly. Run after the migration that adds the column:
//
//   npx tsx --env-file=.env.local scripts/backfill-root-domain.ts
//
// On a fresh/split production database (see punchlist INF-1), run this once after
// `drizzle-kit migrate` so existing rows participate in domain-based dedupe.
import { getDb } from "../lib/db/client";
import { company } from "../lib/db/schema";
import { rootDomain } from "../lib/util/domain";
import { eq } from "drizzle-orm";

async function main() {
  const db = getDb();
  const rows = await db
    .select({ id: company.id, website: company.website, current: company.rootDomain })
    .from(company);

  let updated = 0;
  let cleared = 0;
  let unchanged = 0;
  for (const r of rows) {
    const desired = rootDomain(r.website);
    if (desired === r.current) {
      unchanged++;
      continue;
    }
    await db.update(company).set({ rootDomain: desired }).where(eq(company.id, r.id));
    if (desired === null) cleared++;
    else updated++;
  }

  console.log(
    `Backfill complete: ${rows.length} companies · ${updated} set · ${cleared} cleared · ${unchanged} unchanged`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
