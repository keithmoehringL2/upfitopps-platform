// Subdomains the platform must NEVER hand out as a distributor slug.
//
// This includes infrastructure hostnames and the existing white-label
// calculator deploys (ptc.upfitopps.com, messer.upfitopps.com) which are
// served by their own separate Vercel projects. Those exact subdomains take
// precedence over this project's wildcard, so they keep resolving to the
// calculators — but we still reserve the names here so tenant provisioning can
// never try to create a colliding slug. Add future calculator client slugs here.
export const RESERVED_SUBDOMAINS = new Set<string>([
  "www",
  "app",
  "admin",
  "api",
  "portal",
  "mail",
  "static",
  "assets",
  "cdn",
  "help",
  "support",
  "status",
  "docs",
  "blog",
  // existing calculator clients — do not reuse as tenant slugs
  "ptc",
  "messer",
]);

// A valid distributor slug: lowercase alphanumeric with internal hyphens,
// 2–32 chars, not a reserved name.
export function isSlugAvailable(slug: string): boolean {
  const shape = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
  return shape.test(slug) && !RESERVED_SUBDOMAINS.has(slug);
}
