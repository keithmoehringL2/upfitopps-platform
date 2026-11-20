// Manually run the daily-email job once (ignores the per-distributor send-day
// schedule via force), for local testing. With no RESEND_API_KEY it logs each
// recipient instead of sending; with a key + verified sender it actually sends.
//
// Run: npm run email:test
import { sendDailyEmails } from "../lib/email/send-daily";
import { sendManagerSummaries } from "../lib/email/send-summaries";

async function main() {
  const daily = await sendDailyEmails({ force: true });
  console.log(`\nRep daily email — sent ${daily.sent}, skipped ${daily.skipped}, failed ${daily.failed}`);
  for (const d of daily.details) {
    console.log(`  ${d.status.padEnd(7)} ${d.email}${d.reason ? ` (${d.reason})` : ""}`);
  }

  const summary = await sendManagerSummaries({ force: true });
  console.log(`\nManager summary — sent ${summary.sent}, skipped ${summary.skipped}, failed ${summary.failed}`);
  for (const d of summary.details) {
    console.log(`  ${d.status.padEnd(7)} ${d.email}${d.reason ? ` (${d.reason})` : ""}`);
  }

  if (!process.env.RESEND_API_KEY) {
    console.log("\nNote: RESEND_API_KEY is not set, so nothing was actually sent.");
  }
  process.exit(daily.failed + summary.failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
