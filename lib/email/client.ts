import { Resend } from "resend";

// Thin wrapper around Resend. With no RESEND_API_KEY (local dev) it logs and
// reports the send as skipped rather than failing, so the whole daily-email
// flow is exercisable without a provider wired up.

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  skipped?: boolean;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — not sending. to=${input.to} subject="${input.subject}"`,
    );
    return { ok: true, skipped: true };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/**
 * The "From" header. The address comes from a single verified sender
 * (EMAIL_FROM_ADDRESS); the display name is per-distributor, matching the
 * design's "{Distributor} via UpfitOutreach" sender label. Falls back to Resend's
 * shared testing address so a key-only dev setup can send to the account owner.
 */
export function fromAddress(distributorName: string): string {
  const addr = process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev";
  return `${distributorName} via UpfitOutreach <${addr}>`;
}
