import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { session as sessionTable, user as userTable } from "@/lib/db/schema";

// Database-backed sessions: a random token lives in an HttpOnly cookie; only
// its SHA-256 hash is stored in the `session` row, so a DB leak can't be
// replayed as a cookie. Sessions are server-side and individually revocable.
const COOKIE = "upfit_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (rep device-session target)

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + MAX_AGE_MS);

  await getDb()
    .insert(sessionTable)
    .values({ userId, tokenHash: hashToken(token), expiresAt });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // allow http://localhost in dev
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

/** The authenticated user, or null. Validates the session against the DB. */
export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const rows = await getDb()
    .select({
      id: userTable.id,
      email: userTable.email,
      role: userTable.role,
      distributorId: userTable.distributorId,
      manufacturerId: userTable.manufacturerId,
      status: userTable.status,
    })
    .from(sessionTable)
    .innerJoin(userTable, eq(sessionTable.userId, userTable.id))
    .where(
      and(
        eq(sessionTable.tokenHash, hashToken(token)),
        isNull(sessionTable.revokedAt),
        gt(sessionTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const u = rows[0];
  if (!u || u.status !== "active") return null;
  return u;
}

export async function deleteSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await getDb()
      .update(sessionTable)
      .set({ revokedAt: new Date() })
      .where(eq(sessionTable.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE);
}
