"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { createRepLoginToken } from "@/lib/auth/rep-token";
import { deleteSession } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { isChannel, isOutcome } from "@/lib/rep/outcomes";

const IS_DEV = process.env.NODE_ENV !== "production";

export type RepLinkState = { error?: string; sent?: boolean; devLink?: string };

/**
 * Passwordless rep login. In production this would email the magic link and
 * always return a generic "sent" message (no account enumeration). In dev, with
 * no mail provider wired up, it surfaces the link right on the page so you can
 * click through — the real token flow, minus the email hop.
 */
export async function requestRepLink(
  _prev: RepLinkState | undefined,
  formData: FormData,
): Promise<RepLinkState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email." };

  const rows = await getDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  const u = rows[0];
  const isActiveRep = u && u.role === "rep" && u.status === "active";

  if (isActiveRep) {
    const token = await createRepLoginToken(u.id);
    const h = await headers();
    const host =
      h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const proto = h.get("x-forwarded-proto") ?? (IS_DEV ? "http" : "https");
    const link = `${proto}://${host}/rep/auth?token=${token}`;
    console.log(`[rep-login] magic link for ${email}: ${link}`);
    // In production: await sendRepLoginEmail(email, link); then fall through.
    return IS_DEV ? { sent: true, devLink: link } : { sent: true };
  }

  // Unknown or non-rep address. Dev gets a helpful hint; prod stays generic.
  if (IS_DEV) {
    return {
      error: "No active rep with that email. Try rep1@truckcolors.test.",
    };
  }
  return { sent: true };
}

export type LogState = { error?: string };

/** Log an outcome against a prospect, then advance the rep back to their queue. */
export async function logOutcome(
  _prev: LogState | undefined,
  formData: FormData,
): Promise<LogState> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") {
    return { error: "You are not signed in as a rep." };
  }

  const companyId = String(formData.get("companyId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const channelRaw = String(formData.get("channel") ?? "call");
  const note = String(formData.get("note") ?? "");

  if (!companyId || !isOutcome(outcome)) {
    return { error: "Pick an outcome." };
  }
  const channel = isChannel(channelRaw) ? channelRaw : "call";

  try {
    await data.logInteraction(ctx, { companyId, outcome, channel, note });
  } catch {
    return {
      error: "Could not log that — the prospect may not be in your queue.",
    };
  }

  // Outside the try: redirect() throws a control-flow signal we must not catch.
  redirect("/rep");
}

export async function repLogout(): Promise<void> {
  await deleteSession();
  redirect("/rep/login");
}
