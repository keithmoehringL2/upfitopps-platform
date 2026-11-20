import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { emailVerificationToken as tokenTable } from "@/lib/db/schema";

// Passwordless rep login. A random token travels in the magic link; only its
// SHA-256 hash is stored, with purpose "rep_device_verify". Tokens are
// single-use (consumeRepLoginToken flips consumed_at atomically) and short-lived.
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a login token for a user and return the raw token for the link. */
export async function createRepLoginToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb()
    .insert(tokenTable)
    .values({
      userId,
      tokenHash: hashToken(token),
      purpose: "rep_device_verify",
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });
  return token;
}

/**
 * Consume a login token. Atomic: the single UPDATE only matches an unconsumed,
 * unexpired rep token, so a token can never be redeemed twice. Returns the user
 * id on success, or null if the token is invalid/expired/already used.
 */
export async function consumeRepLoginToken(
  token: string,
): Promise<string | null> {
  if (!token) return null;
  const now = new Date();
  const rows = await getDb()
    .update(tokenTable)
    .set({ consumedAt: now })
    .where(
      and(
        eq(tokenTable.tokenHash, hashToken(token)),
        eq(tokenTable.purpose, "rep_device_verify"),
        isNull(tokenTable.consumedAt),
        gt(tokenTable.expiresAt, now),
      ),
    )
    .returning({ userId: tokenTable.userId });
  return rows[0]?.userId ?? null;
}
