"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { user as userTable } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { createSession, deleteSession } from "./session";
import { consumePasswordSetupToken } from "./password-setup";

// Manager password login. Reps are passwordless (separate flow) and
// manufacturers use their own portal, so only managers authenticate here.
export async function login(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  // Generic failure message — never reveal whether the account exists.
  const fail = { error: "Invalid email or password." };

  const rows = await getDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  const u = rows[0];

  if (!u || u.role !== "manager" || !u.passwordHash || u.status !== "active") {
    return fail;
  }
  if (!(await verifyPassword(password, u.passwordHash))) {
    return fail;
  }

  await createSession(u.id);
  redirect("/manager");
}

export async function logout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

// L2 Admin password login. Served on the reserved `admin` subdomain, so paths
// here are host-relative to admin.<root> (the proxy rewrites them to /admin*).
export async function adminLogin(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const fail = { error: "Invalid email or password." };

  const rows = await getDb()
    .select()
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  const u = rows[0];

  if (!u || u.role !== "l2_admin" || !u.passwordHash || u.status !== "active") {
    return fail;
  }
  if (!(await verifyPassword(password, u.passwordHash))) {
    return fail;
  }

  await createSession(u.id);
  redirect("/"); // admin.<root>/ → the Distributors list
}

export async function adminLogout(): Promise<void> {
  await deleteSession();
  redirect("/login");
}

// Manager first-time password setup (and reset): consume the emailed token, set
// the password, sign them in. Served on the apex, where managers sign in.
export async function setPassword(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string } | undefined> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { error: "Use at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The passwords don't match." };
  }

  const userId = await consumePasswordSetupToken(token);
  if (!userId) {
    return { error: "This link has expired or already been used. Ask your admin for a new one." };
  }

  await getDb()
    .update(userTable)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(userTable.id, userId));

  await createSession(userId);
  redirect("/manager");
}
