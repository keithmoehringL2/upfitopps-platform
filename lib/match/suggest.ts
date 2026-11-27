// Fuzzy "is this the same business?" matcher. Used when an imported (or manually
// added) company has no website to dedupe on: we surface look-alike existing
// companies by phone, name and address so a human can merge instead of creating
// a duplicate. Pure and dependency-free; reusable by the import flow now and a
// future rep/manager "Add company" screen. It NEVER auto-merges — it only ranks
// candidates; a person decides.

export interface MatchFields {
  name: string;
  phone?: string | null;
  zip?: string | null;
  address?: string | null;
}
export interface MatchTarget extends MatchFields {
  id: string;
}
export interface ScoredMatch {
  id: string;
  name: string;
  score: number;
  reasons: string[];
}

// Score threshold below which a candidate isn't worth surfacing, and how many to
// show. A single weak signal (similar-name only) stays under the bar.
const THRESHOLD = 50;
const MAX_SUGGESTIONS = 3;

// Tokens dropped from a company name before comparison: legal forms and filler.
const NAME_STOPWORDS = new Set([
  "the", "inc", "incorporated", "llc", "llp", "lp", "co", "corp", "corporation",
  "company", "ltd", "limited", "group", "services", "service", "and", "of",
]);

// Street-type abbreviations so "123 Main Street" and "123 Main St" match.
const STREET_ABBR: Record<string, string> = {
  street: "st", avenue: "ave", boulevard: "blvd", road: "rd", drive: "dr",
  lane: "ln", court: "ct", place: "pl", terrace: "ter", parkway: "pkwy",
  highway: "hwy", suite: "ste", apartment: "apt", building: "bldg",
  north: "n", south: "s", east: "e", west: "w",
};

/** Last 10 digits of a phone, or "" if fewer than 10 digits. */
export function digits10(phone: string | null | undefined): string {
  const d = (phone ?? "").replace(/\D+/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
}

/** Meaningful lowercase tokens of a company name (legal/filler words dropped). */
export function nameTokens(name: string | null | undefined): Set<string> {
  const toks = (name ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "") // "Joe's" -> "joes", not "joe" + "s"
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !NAME_STOPWORDS.has(t));
  return new Set(toks);
}

/** Order-independent name key (sorted meaningful tokens). "" when empty. */
export function nameKey(name: string | null | undefined): string {
  return [...nameTokens(name)].sort().join(" ");
}

/** Normalized street key: number + abbreviated street name, suite/unit dropped. */
export function addrKey(address: string | null | undefined): string {
  let a = (address ?? "").toLowerCase();
  // Drop anything from a unit/suite marker onward.
  a = a.split(/\b(?:ste|suite|unit|apt|#|bldg)\b/)[0];
  const toks = a
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => STREET_ABBR[t] ?? t);
  return toks.join(" ").trim();
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Rank existing companies that look like the same business as `candidate`.
 * Returns up to 3 above the score threshold, strongest first, each with the
 * human reasons it matched.
 */
export function suggestMatches(candidate: MatchFields, targets: MatchTarget[]): ScoredMatch[] {
  const cPhone = digits10(candidate.phone);
  const cNameKey = nameKey(candidate.name);
  const cNameToks = nameTokens(candidate.name);
  const cAddr = addrKey(candidate.address);
  const cZip = (candidate.zip ?? "").trim();

  const scored: ScoredMatch[] = [];
  for (const t of targets) {
    let score = 0;
    const reasons: string[] = [];
    const add = (s: number, ...r: string[]) => {
      score = Math.max(score, s);
      for (const x of r) if (!reasons.includes(x)) reasons.push(x);
    };

    const zipSame = !!cZip && cZip === (t.zip ?? "").trim();

    if (cPhone && cPhone === digits10(t.phone)) add(100, "Same phone");

    const tNameKey = nameKey(t.name);
    if (cNameKey && cNameKey === tNameKey) {
      zipSame ? add(92, "Same name", "Same ZIP") : add(72, "Same name");
    } else if (jaccard(cNameToks, nameTokens(t.name)) >= 0.6) {
      zipSame ? add(64, "Similar name", "Same ZIP") : add(36, "Similar name");
    }

    const tAddr = addrKey(t.address);
    if (cAddr && cAddr === tAddr) {
      zipSame ? add(84, "Same address", "Same ZIP") : add(56, "Same address");
    }

    if (score >= THRESHOLD) scored.push({ id: t.id, name: t.name, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_SUGGESTIONS);
}
