"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import type { SlugState } from "@/lib/db/gateway";
import { createPasswordSetupToken } from "@/lib/auth/password-setup";
import { apexBaseUrl, portalBaseUrl } from "@/lib/tenancy/resolve";
import { sendEmail, fromAddress } from "@/lib/email/client";

const IS_DEV = process.env.NODE_ENV !== "production";

async function adminCtx() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "l2_admin") return null;
  return ctx;
}

/** Live subdomain availability check for the wizard's Account step. */
export async function checkSlugAction(slug: string): Promise<{ state: SlugState }> {
  const ctx = await adminCtx();
  if (!ctx) return { state: "bad_format" };
  return data.checkSlug(ctx, slug);
}

/** Upload a distributor logo to Vercel Blob; returns its public URL. */
export async function uploadLogoAction(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { error: "Not signed in as an admin." };
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { error: "Logo storage isn't configured yet — set BLOB_READ_WRITE_TOKEN to enable uploads." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > 2_000_000) return { error: "Logo must be under 2 MB." };
  const ext = file.type === "image/svg+xml" ? "svg" : file.type === "image/jpeg" ? "jpg" : "png";
  try {
    const blob = await put(`distributor-logos/${crypto.randomUUID()}.${ext}`, file, {
      access: "public",
      contentType: file.type || "image/png",
    });
    return { url: blob.url };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export interface CreateDistributorPayload {
  name: string;
  slug: string;
  primaryColor: string;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  manager: { name: string; email: string };
  reps: { name: string; email: string; dailyTarget: number }[];
  programs: { programId: string; cohort?: string | null; regionalRepUserId?: string | null }[];
}

export type CreateDistributorResult =
  | { ok: true; id: string; slug: string; name: string; managerEmail: string; repCount: number; setupLink?: string }
  | { ok: false; error: string };

/** Provision a distributor, then mint + deliver the manager's password-setup link. */
export async function createDistributorAction(
  payload: CreateDistributorPayload,
): Promise<CreateDistributorResult> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };

  let created;
  try {
    created = await data.createDistributor(ctx, payload);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the distributor." };
  }

  // Mint the manager's password-setup link (apex — managers sign in there).
  const token = await createPasswordSetupToken(created.managerId);
  const setupLink = `${apexBaseUrl()}/set-password?token=${token}`;

  // Best-effort email; skipped cleanly in dev with no provider configured.
  await sendEmail({
    to: created.managerEmail,
    from: fromAddress(payload.name),
    subject: `Set up your ${payload.name} manager account on Upfit Opps`,
    html: `<p>Your ${payload.name} workspace on Upfit Opps is ready.</p>
<p>Set your manager password to sign in:</p>
<p><a href="${setupLink}">Set your password</a></p>
<p>This link expires in 24 hours.</p>`,
  });

  revalidatePath("/"); // refresh the admin Distributors list

  return {
    ok: true,
    id: created.id,
    slug: created.slug,
    name: payload.name,
    managerEmail: created.managerEmail,
    repCount: created.repCount,
    // Surface the link in dev (no mail provider) so onboarding is testable.
    setupLink: IS_DEV ? setupLink : undefined,
  };
}

/** Change a distributor's status from the account Overview tab. */
export async function updateStatusAction(
  id: string,
  status: "onboarding" | "active" | "paused" | "disabled",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.updateDistributorStatus(ctx, id, status);
    revalidatePath(`/distributors/${id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update status." };
  }
}

export interface SaveAccountPayload {
  primaryColor: string;
  secondaryColor?: string | null;
  logoUrl?: string | null;
  manager: { id: string; name: string; email: string } | null;
  reps: { id?: string; name: string; email: string; dailyTarget: number; status: "active" | "paused" | "disabled" }[];
  programs: { programId: string; cohort?: string | null; regionalRepUserId?: string | null }[];
}

/** Save the account draft (branding + users + programs). */
export async function saveAccountAction(
  id: string,
  payload: SaveAccountPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.saveDistributorAccount(ctx, id, payload);
    revalidatePath(`/distributors/${id}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

// ───────────────────────── CSV import ────────────────────────────────────

export type PreviewResult =
  | { ok: true; result: Awaited<ReturnType<typeof data.previewImport>> }
  | { ok: false; error: string };

/** Dry-run a mapped CSV for a distributor. */
export async function previewImportAction(
  distributorId: string,
  csvText: string,
  columnMap: Record<string, string>,
): Promise<PreviewResult> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    return { ok: true, result: await data.previewImport(ctx, distributorId, csvText, columnMap) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not preview the import." };
  }
}

/** Commit a mapped CSV. */
export async function commitImportAction(
  distributorId: string,
  csvText: string,
  columnMap: Record<string, string>,
  overrides: { owner?: boolean },
  filename: string,
): Promise<{ ok: true; batchId: string; counts: { rows: number; created: number; updated: number; skipped: number } } | { ok: false; error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    const res = await data.commitImport(ctx, distributorId, csvText, columnMap, overrides, filename);
    revalidatePath(`/distributors/${distributorId}`);
    revalidatePath("/");
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not commit the import." };
  }
}

/** Roll back a committed import. */
export async function rollbackImportAction(
  batchId: string,
  distributorId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.rollbackImport(ctx, batchId);
    revalidatePath(`/distributors/${distributorId}`);
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not roll back the import." };
  }
}

// ───────────────────────── Manufacturers ─────────────────────────────────

type AdminResult = { ok: true } | { ok: false; error: string };

export async function createManufacturerAction(name: string): Promise<AdminResult> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.createManufacturer(ctx, name);
    revalidatePath("/manufacturers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the manufacturer." };
  }
}

export async function addManufacturerUserAction(
  manufacturerId: string,
  input: { name: string; email: string; role: "mfr_regional" | "mfr_leadership" },
): Promise<AdminResult> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.createManufacturerUser(ctx, manufacturerId, input);
    revalidatePath("/manufacturers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the user." };
  }
}

export async function setAssignmentRepAction(
  programDistributorId: string,
  regionalRepUserId: string | null,
): Promise<AdminResult> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    await data.setProgramAssignmentRep(ctx, programDistributorId, regionalRepUserId);
    revalidatePath("/manufacturers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the assignment." };
  }
}

/** Mint a password-setup link for a manufacturer portal user (lands on the
 *  portal subdomain). The admin copies/sends it. */
export async function manufacturerSetupLinkAction(
  userId: string,
): Promise<{ ok: true; link: string } | { ok: false; error: string }> {
  const ctx = await adminCtx();
  if (!ctx) return { ok: false, error: "Not signed in as an admin." };
  try {
    const u = await data.getPortalUser(ctx, userId);
    if (!u) return { ok: false, error: "That user is not a manufacturer portal user." };
    const token = await createPasswordSetupToken(userId);
    return { ok: true, link: `${portalBaseUrl()}/set-password?token=${token}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the setup link." };
  }
}
