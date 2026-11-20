import { buildDailyEmails } from "@/lib/email/send-daily";
import { buildManagerSummaries } from "@/lib/email/send-summaries";

// Dev-only preview of the rendered emails, using real seed data. Never
// available in production.
//   ?type=summary            the manager summary email (first distributor)
//   ?to=<email> / ?i=<index> pick which rep's daily email (default)
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  let html: string | undefined;

  if (url.searchParams.get("type") === "summary") {
    const i = Number(url.searchParams.get("i") ?? 0);
    html = (await buildManagerSummaries({ force: true }))[i]?.html;
  } else {
    const emails = await buildDailyEmails({ force: true });
    const to = url.searchParams.get("to");
    const i = Number(url.searchParams.get("i") ?? 0);
    html = (to ? emails.find((e) => e.to === to) : emails[i])?.html;
  }

  return new Response(
    html ??
      "<p style='font-family:sans-serif;padding:24px'>Nothing to preview. Seed the database and ensure an active rep (daily email) or manager (summary) exists.</p>",
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}
