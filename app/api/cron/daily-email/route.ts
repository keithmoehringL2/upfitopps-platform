import { NextResponse } from "next/server";
import { sendDailyEmails } from "@/lib/email/send-daily";

// Scheduled daily-email trigger. Vercel Cron calls this on the schedule in
// vercel.json and (when CRON_SECRET is set) sends it as a Bearer token, so the
// endpoint rejects anything else. In production the secret is required, so the
// route can never run unauthenticated.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const result = await sendDailyEmails();
  return NextResponse.json(result);
}
