import type { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { consumeRepLoginToken } from "@/lib/auth/rep-token";
import { createSession } from "@/lib/auth/session";

// Magic-link consumer. A GET Route Handler (not a page) because it sets the
// session cookie, which Next only allows in Server Functions / Route Handlers.
// The token is single-use; consuming it mints a device session and drops the
// rep into their queue.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const userId = await consumeRepLoginToken(token);

  if (!userId) {
    redirect("/rep/login?error=link");
  }

  await createSession(userId);
  redirect("/rep");
}
