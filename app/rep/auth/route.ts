import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { consumeRepLoginToken } from "@/lib/auth/rep-token";
import { createSession } from "@/lib/auth/session";
import { getAuthContext } from "@/lib/auth/dal";

// Magic-link consumer. A GET Route Handler (not a page) because it sets the
// session cookie, which Next only allows in Server Functions / Route Handlers.
// The token is single-use; consuming it mints a device session and drops the
// rep at `next` (a daily-email deep link, or the queue by default).
//
// Every daily-email link carries the same single-use token. The FIRST tap
// verifies the device and signs the rep in; a later tap finds the token spent
// but the device already has a session, so it just follows `next`.

/** Only allow in-app rep destinations — never an open/protocol-relative redirect. */
function safeNext(next: string | null): string {
  if (next && next.startsWith("/rep") && !next.startsWith("//")) return next;
  return "/rep";
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const userId = await consumeRepLoginToken(token);
  if (userId) {
    await createSession(userId);
    redirect(next);
  }

  // Token missing / expired / already used. If this device already holds a rep
  // session (e.g. a second tap after the first verified it), just continue.
  const ctx = await getAuthContext();
  if (ctx && ctx.role === "rep") {
    redirect(next);
  }

  redirect("/rep/login?error=link");
}
