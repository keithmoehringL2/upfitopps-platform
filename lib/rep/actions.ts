"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { createRepLoginToken } from "@/lib/auth/rep-token";
import { deleteSession } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { isOutcome } from "@/lib/rep/outcomes";

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

export type LogState = { error?: string; ok?: boolean };

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
  const note = String(formData.get("note") ?? "");
  const notInterested = formData.get("notInterested") === "1";
  const opportunity = formData.get("opportunity") === "1";
  const removeRaw = String(formData.get("remove") ?? "");
  const remove =
    removeRaw === "remove" || removeRaw === "dnc" ? removeRaw : null;
  const fuRaw = String(formData.get("followUpDays") ?? "");
  const followUpDays = fuRaw && Number.isFinite(Number(fuRaw)) ? Number(fuRaw) : null;

  if (!companyId || !isOutcome(outcome)) {
    return { error: "Pick an outcome." };
  }

  try {
    await data.logInteraction(ctx, {
      companyId,
      outcome,
      note,
      notInterested,
      followUpDays,
      opportunity,
      remove,
    });
  } catch {
    return {
      error: "Could not log that — the prospect may not be in your queue.",
    };
  }

  // The client toasts and navigates back to the queue on success (so the toast
  // survives the transition); revalidate so the queue shows the row as worked.
  revalidatePath("/rep");
  return { ok: true };
}

export async function repLogout(): Promise<void> {
  await deleteSession();
  redirect("/rep/login");
}

// ───────────────────────── Decision-maker + quote ────────────────────────

type RepResult = { ok?: true; error?: string };

export async function saveDecisionMakerAction(
  companyId: string,
  dm: { name: string; title?: string; phone?: string; email?: string; notes?: string },
): Promise<RepResult> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") return { error: "You are not signed in as a rep." };
  if (!dm.name.trim()) return { error: "Enter a name." };
  try {
    await data.saveDecisionMaker(ctx, companyId, dm);
    revalidatePath(`/rep/company/${companyId}`);
    revalidatePath("/manager");
    return { ok: true };
  } catch {
    return { error: "Could not save the decision-maker." };
  }
}

export async function removeDecisionMakerAction(companyId: string): Promise<RepResult> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") return { error: "You are not signed in as a rep." };
  try {
    await data.removeDecisionMaker(ctx, companyId);
    revalidatePath(`/rep/company/${companyId}`);
    revalidatePath("/manager");
    return { ok: true };
  } catch {
    return { error: "Could not remove the decision-maker." };
  }
}

export async function recordQuoteAction(companyId: string): Promise<RepResult & { count?: number }> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") return { error: "You are not signed in as a rep." };
  try {
    const count = await data.recordQuote(ctx, companyId);
    revalidatePath(`/rep/company/${companyId}`);
    revalidatePath("/manager");
    return { ok: true, count };
  } catch {
    return { error: "Could not record the quote." };
  }
}

// ───────────────────────── Find by ZIP ───────────────────────────────────

export type ZipRow = Awaited<ReturnType<typeof data.searchCompaniesByZip>>[number];
type ZipResult = { ok: true; zip: string; results: ZipRow[] } | { ok: false; error: string };

export async function searchZipAction(zip: string): Promise<ZipResult> {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "rep") return { ok: false, error: "You are not signed in as a rep." };
  const z = zip.replace(/\D/g, "").slice(0, 5);
  if (z.length !== 5) return { ok: false, error: "Enter all five digits." };
  try {
    const results = await data.searchCompaniesByZip(ctx, z);
    return { ok: true, zip: z, results };
  } catch {
    return { ok: false, error: "Could not search that ZIP." };
  }
}
