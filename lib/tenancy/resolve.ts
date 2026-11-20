import { RESERVED_SUBDOMAINS } from "./reserved-slugs";

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "upfitopps.com";

export type ResolvedHost =
  | { kind: "apex" }
  | { kind: "reserved"; name: string }
  | { kind: "tenant"; slug: string };

/**
 * Map an incoming Host header to what the platform should serve.
 *
 *   upfitopps.com            -> apex      (marketing one-pager + login)
 *   www.upfitopps.com        -> apex
 *   admin.upfitopps.com      -> reserved  (L2 admin portal)
 *   portal.upfitopps.com     -> reserved  (manufacturer portal)
 *   truckcolors.upfitopps.com-> tenant    (distributor workspace)
 *
 * Works in production (`*.upfitopps.com`) and local dev (`*.localhost`).
 * This is routing only — it never grants access. Authorization must
 * independently confirm the authenticated user is allowed on this tenant.
 */
/**
 * Absolute base URL for a distributor's workspace, derived from its slug and
 * the root domain. Used where there is no request host to read — notably the
 * daily-email cron, whose links must land on the rep's own subdomain so the
 * host-only session cookie applies there. Production serves `*.<root>` over
 * https; local dev uses `<slug>.localhost:<port>` (which resolves to 127.0.0.1).
 */
export function tenantBaseUrl(slug: string): string {
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "upfitopps.com";
  if (process.env.NODE_ENV === "production") return `https://${slug}.${root}`;
  const port = process.env.PORT ?? "3000";
  return `http://${slug}.localhost:${port}`;
}

export function resolveHost(rawHost: string): ResolvedHost {
  const host = (rawHost || "").split(":")[0].toLowerCase().trim();

  let subdomain = "";
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) {
    subdomain = "";
  } else if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    subdomain = host.slice(0, host.length - (`.${ROOT_DOMAIN}`).length);
  } else if (host === "localhost" || host === "127.0.0.1") {
    subdomain = "";
  } else if (host.endsWith(".localhost")) {
    subdomain = host.slice(0, host.length - ".localhost".length);
  } else {
    // Unknown host (e.g. a *.vercel.app preview URL): treat as apex.
    subdomain = "";
  }

  if (subdomain === "" || subdomain === "www") {
    return { kind: "apex" };
  }

  // Only the first label is the tenant/area; ignore any nested labels.
  const label = subdomain.split(".")[0];

  if (RESERVED_SUBDOMAINS.has(label)) {
    return { kind: "reserved", name: label };
  }

  return { kind: "tenant", slug: label };
}
