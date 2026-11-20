// Minimal, correct CSV handling for prospect imports. The parser is RFC 4180-ish
// (quoted fields, escaped "" quotes, commas and newlines inside quotes, CRLF),
// with no dependency. rowsToCompanyInputs maps a header row + body to typed,
// validated company inputs the gateway can upsert.

export interface CompanyImport {
  externalImportId: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  website?: string | null;
  industryPrimary?: string | null;
  industrySub?: string | null;
  description?: string | null;
  totalVehicles?: number | null;
  truckCount?: number | null;
  vanCount?: number | null;
  fleetMix?: string | null;
  priorityScore?: string | null;
  priorityExplanation?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ParseResult {
  companies: CompanyImport[];
  errors: string[];
}

/** Parse CSV text into rows of string cells. */
export function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // flush trailing field/row if any content
  if (field.length > 0 || row.length > 0) endRow();

  // drop fully-empty rows
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Header aliases → CompanyImport keys (header normalized to lowercase words).
const HEADER_MAP: Record<string, keyof CompanyImport> = {
  "external id": "externalImportId",
  "external import id": "externalImportId",
  "import id": "externalImportId",
  id: "externalImportId",
  name: "name",
  company: "name",
  "company name": "name",
  address: "address",
  street: "address",
  city: "city",
  state: "state",
  zip: "zip",
  "zip code": "zip",
  "postal code": "zip",
  phone: "phone",
  website: "website",
  url: "website",
  industry: "industryPrimary",
  "industry primary": "industryPrimary",
  "primary industry": "industryPrimary",
  "industry sub": "industrySub",
  "sub industry": "industrySub",
  description: "description",
  "total vehicles": "totalVehicles",
  vehicles: "totalVehicles",
  trucks: "truckCount",
  "truck count": "truckCount",
  vans: "vanCount",
  "van count": "vanCount",
  "fleet mix": "fleetMix",
  priority: "priorityScore",
  "priority score": "priorityScore",
  score: "priorityScore",
  "priority explanation": "priorityExplanation",
  why: "priorityExplanation",
  "place id": "placeId",
  "google place id": "placeId",
  latitude: "latitude",
  lat: "latitude",
  longitude: "longitude",
  lng: "longitude",
  lon: "longitude",
  long: "longitude",
};

const normalizeHeader = (h: string) =>
  h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function toInt(v: string): number | null {
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toScore(v: string): string | null {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(0, Math.min(9.9, n));
  return clamped.toFixed(1);
}
function toFloat(v: string): number | null {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Turn parsed CSV rows into validated company inputs. The first row is the
 * header. Rows without a name are reported as errors (not imported). Missing
 * external ids fall back to a slug of the name so re-imports dedupe.
 */
export function rowsToCompanyInputs(rows: string[][]): ParseResult {
  const errors: string[] = [];
  if (rows.length === 0) return { companies: [], errors: ["The file is empty."] };

  const header = rows[0].map(normalizeHeader);
  const keys = header.map((h) => HEADER_MAP[h]);
  if (!keys.includes("name")) {
    return { companies: [], errors: ['No "name" column found. A header row with a Name column is required.'] };
  }

  const companies: CompanyImport[] = [];
  const seen = new Set<string>();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rec: Partial<Record<keyof CompanyImport, string>> = {};
    keys.forEach((key, c) => {
      if (key) rec[key] = (cells[c] ?? "").trim();
    });

    const name = rec.name?.trim();
    if (!name) {
      errors.push(`Row ${r + 1}: skipped (no company name).`);
      continue;
    }
    const externalImportId = rec.externalImportId?.trim() || slugify(name);
    if (seen.has(externalImportId)) {
      errors.push(`Row ${r + 1}: duplicate id "${externalImportId}" in file — later row kept.`);
    }
    seen.add(externalImportId);

    companies.push({
      externalImportId,
      name,
      address: rec.address || null,
      city: rec.city || null,
      state: rec.state || null,
      zip: rec.zip || null,
      phone: rec.phone || null,
      website: rec.website || null,
      industryPrimary: rec.industryPrimary || null,
      industrySub: rec.industrySub || null,
      description: rec.description || null,
      totalVehicles: rec.totalVehicles ? toInt(rec.totalVehicles) : null,
      truckCount: rec.truckCount ? toInt(rec.truckCount) : null,
      vanCount: rec.vanCount ? toInt(rec.vanCount) : null,
      fleetMix: rec.fleetMix || null,
      priorityScore: rec.priorityScore ? toScore(rec.priorityScore) : null,
      priorityExplanation: rec.priorityExplanation || null,
      placeId: rec.placeId || null,
      latitude: rec.latitude ? toFloat(rec.latitude) : null,
      longitude: rec.longitude ? toFloat(rec.longitude) : null,
    });
  }

  // De-dupe within the file, keeping the last occurrence of each id.
  const byId = new Map<string, CompanyImport>();
  for (const c of companies) byId.set(c.externalImportId, c);

  return { companies: [...byId.values()], errors };
}
