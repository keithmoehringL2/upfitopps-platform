import { buildDailyEmails } from "@/lib/email/send-daily";

// Dev-only preview of the rendered daily email, using real seed data. Returns
// the first email-enabled rep's email as HTML so it can be opened in a browser.
// Never available in production.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }
  const emails = await buildDailyEmails({ force: true });
  // ?to=<email> or ?i=<index> picks which recipient's email to preview.
  const url = new URL(request.url);
  const to = url.searchParams.get("to");
  const i = Number(url.searchParams.get("i") ?? 0);
  const chosen = to ? emails.find((e) => e.to === to) : emails[i];
  const html =
    chosen?.html ??
    "<p style='font-family:sans-serif;padding:24px'>No email-enabled reps found. Seed the database and ensure a rep is active with daily email enabled.</p>";
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
