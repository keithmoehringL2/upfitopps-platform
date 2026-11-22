import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { emailVerificationToken as tokenTable } from "@/lib/db/schema";

// Password setup / reset tokens for managers (role = password login). A random
// token travels in the setup link; only its SHA-256 hash is stored, with
// purpose "password_reset". Single-use and time-limited.
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for first-time setup

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a password-setup token for a user; returns the raw token for the link. */
export async function createPasswordSetupToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(tokenTable)
    .values({
      userId,
      tokenHash: hashToken(token),
      purpose: "password_reset",
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });
  return token;
}

/**
 * Consume a setup token atomically (the single UPDATE matches only an unused,
 * unexpired password_reset token), returning the user id or null.
 */
export async function consumePasswordSetupToken(token: string): Promise<string | null> {
  if (!token) return null;
  const now = new Date();
  const rows = await getDb()
    .update(tokenTable)
    .set({ consumedAt: now })
    .where(
      and(
        eq(tokenTable.tokenHash, hashToken(token)),
        eq(tokenTable.purpose, "password_reset"),
        isNull(tokenTable.consumedAt),
        gt(tokenTable.expiresAt, now),
      ),
    )
    .returning({ userId: tokenTable.userId });
  return rows[0]?.userId ?? null;
}
