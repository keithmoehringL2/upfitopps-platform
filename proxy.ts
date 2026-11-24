import { NextRequest, NextResponse } from "next/server";
import { resolveHost } from "@/lib/tenancy/resolve";

// Host-based routing (Next 16 "proxy" convention, formerly "middleware").
// Run on everything except Next internals and static assets.
export const config = {
  matcher: ["/((?!_next/|favicon.ico|robots.txt|sitemap.xml).*)"],
};

export function proxy(req: NextRequest) {
  const url = req.nextUrl;

  // Static files in /public (the logo, sample CSV, etc.) are host-agnostic.
  // Never rewrite a path with a file extension into a tenant/reserved route
  // segment, or assets like /brand/upfit-outreach-logo.png 404 on subdomains.
  if (/\.[^/]+$/.test(url.pathname)) {
    return NextResponse.next();
  }

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

  // Tenant subdomain (<slug>.<root>): serve the top-level app routes directly.
  // The rep and manager apps scope themselves by the host-only session cookie,
  // not by the path, so no rewrite is needed. (Previously this rewrote into a
  // /t/[slug] segment that has no rep/manager routes, so <slug>.host/rep 404'd —
  // the exact URL the daily email and rep sign-in links point to.)
  return NextResponse.next();
}
