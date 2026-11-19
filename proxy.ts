import { NextRequest, NextResponse } from "next/server";
import { resolveHost } from "@/lib/tenancy/resolve";

// Host-based routing (Next 16 "proxy" convention, formerly "middleware").
// Run on everything except Next internals and static assets.
export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const resolved = resolveHost(req.headers.get("host") ?? "");

  // Apex host: marketing one-pager + login live at the root routes as-is.
  if (resolved.kind === "apex") {
    return NextResponse.next();
  }

  // Reserved areas: the L2 admin portal and the manufacturer portal have their
  // own authenticated apps on dedicated subdomains.
  if (resolved.kind === "reserved") {
    if (resolved.name === "admin" || resolved.name === "portal") {
      const dest = url.clone();
      dest.pathname = `/${resolved.name}${url.pathname === "/" ? "" : url.pathname}`;
      return NextResponse.rewrite(dest);
    }
    // Any other reserved hostname is infrastructure, not an app.
    return new NextResponse("Not found", { status: 404 });
  }

  // Tenant subdomain: rewrite into the /t/[slug] route segment and stamp the
  // slug on a request header so server components can read it.
  const dest = url.clone();
  dest.pathname = `/t/${resolved.slug}${url.pathname === "/" ? "" : url.pathname}`;
  const res = NextResponse.rewrite(dest);
  res.headers.set("x-upfit-tenant", resolved.slug);
  return res;
}
