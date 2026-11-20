"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import type { ManagerSettings } from "@/lib/manager/settings";

export type AssignState = { ok?: boolean; changed?: number; error?: string };

async function managerCtx() {
  const ctx = await getAuthContext();
  if (!ctx || ctx.role !== "manager") return null;
  return ctx;
}

/** Assign/unassign the selected companies to a rep (ownerUserId ""/__unassign__ = unassign). */
export async function assignCompaniesAction(
  _prev: AssignState | undefined,
  formData: FormData,
): Promise<AssignState> {
  const ctx = await managerCtx();
  if (!ctx) return { error: "Managers only." };

  const ids = String(formData.get("companyIds") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ownerRaw = String(formData.get("ownerUserId") ?? "");
  const ownerUserId = ownerRaw && ownerRaw !== "__unassign__" ? ownerRaw : null;

  if (ids.length === 0) return { error: "Select companies first." };

  try {
    const changed = await data.assignCompanies(ctx, ids, ownerUserId);
    revalidatePath("/manager/companies");
    revalidatePath("/manager");
    return { ok: true, changed };
  } catch {
    return { error: "Could not assign. Check your selection." };
  }
}

type Result = { ok?: true; error?: string };

// ───────────────────────── Settings: immediate actions ───────────────────

export async function revokeSessions(repId: string): Promise<Result> {
  const ctx = await managerCtx();
  if (!ctx) return { error: "Managers only." };
  try {
    await data.revokeRepSessions(ctx, repId);
    return { ok: true };
  } catch {
    return { error: "Could not revoke sessions." };
  }
}

export async function reassignRep(
  fromId: string,
  toId: string | null,
): Promise<Result & { changed?: number }> {
  const ctx = await managerCtx();
  if (!ctx) return { error: "Managers only." };
  if (!fromId || fromId === toId) return { error: "Pick two different reps." };
  try {
    const changed = await data.reassignCompanies(ctx, fromId, toId);
    revalidatePath("/manager");
    revalidatePath("/manager/companies");
    return { ok: true, changed };
  } catch {
    return { error: "Could not reassign." };
  }
}

// ───────────────────────── Settings: batched save ────────────────────────

export type SavePayload = {
  reps: { id: string; dailyTarget: number; status: "active" | "paused" | "disabled"; dailyEmailEnabled: boolean }[];
  newReps: { email: string; dailyTarget: number }[];
  settings: ManagerSettings;
};

type SaveResult =
  | { ok: true; team: Awaited<ReturnType<typeof data.listTeam>>; settings: ManagerSettings }
  | { ok: false; error: string };

export async function saveSettingsAction(payload: SavePayload): Promise<SaveResult> {
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "Managers only." };
  try {
    const res = await data.saveManagerSettings(ctx, payload);
    revalidatePath("/manager/settings");
    revalidatePath("/manager");
    return { ok: true, team: res.team, settings: res.settings };
  } catch {
    return { ok: false, error: "Could not save settings." };
  }
}
