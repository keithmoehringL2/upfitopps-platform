// Normalize a website into its registrable "root" domain, used as the dedupe
// identity for a company. Dependency-free (same spirit as lib/import/csv.ts):
// no public-suffix-list package, just a small built-in set of the common
// multi-part suffixes so e.g. "shop.example.co.uk" doesn't collapse to "co.uk".
//
//   https://www.www.joesroofing.com/path?q=1  -> joesroofing.com
//   funny.joesexcavating.com                   -> joesexcavating.com
//   JoesRoofing.COM                            -> joesroofing.com
//   (blank / "localhost" / "10.0.0.1")         -> null

// Two-label public suffixes we must keep intact (take three labels, not two).
// Not exhaustive — covers the markets this tool is realistically used in. Add
// more here if a legitimate multi-part TLD shows up.
const MULTI_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "gov.uk", "ac.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "net.nz", "org.nz",
  "com.br", "com.mx", "com.ar", "com.co",
  "co.za", "co.in", "co.jp", "co.kr",
  "com.sg", "com.hk", "com.tw", "com.my", "com.ph",
]);

/**
 * Reduce a raw website string to its registrable root domain, lowercased, or
 * null when there's nothing usable (blank, no dot, bare IP, localhost).
 */
export function rootDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (!host) return null;

  // Strip scheme (http://, https://, ftp://, mailto:, //) …
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^\/\//, "");
  // … userinfo (user:pass@) …
  host = host.replace(/^[^@/]*@/, "");
  // … and everything from the first path / query / fragment separator.
  host = host.split(/[/?#\\]/, 1)[0];
  // … then any :port.
  host = host.replace(/:\d+$/, "");
  // Trim stray leading/trailing dots.
  host = host.replace(/^\.+|\.+$/g, "");

  if (!host || !host.includes(".")) return null; // bare host / localhost
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null; // IPv4 literal

  const labels = host.split(".").filter(Boolean);
  if (labels.length < 2) return null;

  // Keep three labels for known two-part suffixes, otherwise the last two.
  const lastTwo = labels.slice(-2).join(".");
  const take = MULTI_PART_SUFFIXES.has(lastTwo) ? 3 : 2;
  const parts = labels.slice(-take);
  if (parts.length < 2) return null;

  // Sanity: the registrable (second-level) label and TLD must look real.
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  if (!/^[a-z]{2,}$/.test(tld)) return null; // TLD must be alphabetic
  if (!sld || !/[a-z0-9]/.test(sld)) return null;

  return parts.join(".");
}
