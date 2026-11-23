// CSV import engine for the L2 admin. Pure (no DB): the gateway fetches the
// distributor's existing companies, reps and programs and passes them in. The
// engine maps columns to canonical fields, validates each row, and produces the
// dry-run result and the records to commit.

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
}

// Canonical target fields (matches the Admin prototype, minus candidate_* which
// has no store yet). 6 required.
export const IMPORT_FIELDS: ImportField[] = [
  { key: "external_id", label: "External company ID", required: true },
  { key: "company_name", label: "Company name", required: true },
  { key: "address", label: "Street address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip", label: "ZIP code", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "website", label: "Website", required: false },
  { key: "vio_industry", label: "Industry (VIO primary)", required: false },
  { key: "vio_subcategory", label: "Industry subcategory", required: false },
  { key: "total_vehicles", label: "Total vehicles", required: false },
  { key: "truck_count", label: "Truck count", required: false },
  { key: "van_count", label: "Van count", required: false },
  { key: "model_mix", label: "Model / type mix", required: false },
  { key: "priority_score", label: "Priority score (0–5)", required: true },
  { key: "priority_note", label: "Priority explanation", required: false },
  { key: "owner_email", label: "Owner (rep email)", required: false },
  { key: "program_code", label: "Program / source code", required: true },
  { key: "touch_interval_days", label: "Touch-base interval (days)", required: false },
];

export const REQUIRED_FIELDS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key);

const normalize = (h: string) => h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const FIELD_ALIASES: Record<string, string> = {
  "external id": "external_id", "import id": "external_id", id: "external_id",
  "company name": "company_name", company: "company_name", name: "company_name",
  address: "address", "street address": "address", street: "address",
  city: "city", state: "state",
  zip: "zip", "zip code": "zip", "postal code": "zip",
  phone: "phone",
  website: "website", url: "website",
  "vio industry": "vio_industry", industry: "vio_industry", "primary industry": "vio_industry",
  "vio subcategory": "vio_subcategory", subcategory: "vio_subcategory", "sub industry": "vio_subcategory",
  "total vehicles": "total_vehicles", vehicles: "total_vehicles",
  "truck count": "truck_count", trucks: "truck_count",
  "van count": "van_count", vans: "van_count",
  "model mix": "model_mix", "fleet mix": "model_mix",
  "priority score": "priority_score", priority: "priority_score", score: "priority_score",
  "priority note": "priority_note", "priority explanation": "priority_note", why: "priority_note",
  "owner email": "owner_email", owner: "owner_email",
  "program code": "program_code", program: "program_code", "source code": "program_code",
  "touch interval days": "touch_interval_days", "touch interval": "touch_interval_days",
};

/** Guess a column→field map from the header row. Unknown columns map to "". */
export function autoMap(headers: string[]): Record<string, string> {
  const valid = new Set(IMPORT_FIELDS.map((f) => f.key));
  const map: Record<string, string> = {};
  for (const h of headers) {
    const n = normalize(h);
    const asKey = n.replace(/ /g, "_");
    map[h] = FIELD_ALIASES[n] ?? (valid.has(asKey) ? asKey : "");
  }
  return map;
}

export type ErrorCode =
  | "missing_required"
  | "bad_zip"
  | "invalid_priority"
  | "unknown_owner"
  | "conflicting_program"
  | "duplicate_id"
  | "ambiguous_match";

export interface RowError {
  row: number; // 1-based row number in the file (incl. header)
  externalId: string;
  code: ErrorCode;
  issue: string;
  detail: string;
}

export interface MappedRecord {
  row: number;
  externalId: string;
  isUpdate: boolean;
  ownerUserId: string | null;
  sourceProgramId: string | null;
  fields: {
    name: string;
    address: string | null; city: string | null; state: string | null; zip: string | null;
    phone: string | null; website: string | null;
    industryPrimary: string | null; industrySub: string | null;
    totalVehicles: number | null; truckCount: number | null; vanCount: number | null;
    fleetMix: string | null; priorityScore: string | null; priorityExplanation: string | null;
    touchIntervalDays: number | null;
  };
}

export interface ExistingCompany {
  id: string;
  name: string;
  address: string | null;
  ownerUserId: string | null;
  hasDm: boolean;
  hasFollowUp: boolean;
}

export interface DryRunContext {
  existingByExtId: Map<string, ExistingCompany>;
  nameAddrToExtIds: Map<string, string[]>; // normalized "name|address" → extIds
  repEmailToId: Map<string, string>;
  programCodeToId: Map<string, string>;
}

export interface DryRunResult {
  records: MappedRecord[];
  errors: RowError[];
  counts: { rows: number; created: number; updated: number; skipped: number };
  protectedCounts: { owner: number; pdm: number; fu: number };
}

const toInt = (v: string): number | null => {
  const n = parseInt(v.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};
const nameAddrKey = (name: string, address: string | null) =>
  `${name.trim().toLowerCase()}|${(address ?? "").trim().toLowerCase()}`;

const ISSUE: Record<ErrorCode, string> = {
  missing_required: "Missing required field",
  bad_zip: "Bad ZIP format",
  invalid_priority: "Invalid priority score",
  unknown_owner: "Unknown owner email",
  conflicting_program: "Conflicting program",
  duplicate_id: "Duplicate external ID",
  ambiguous_match: "Ambiguous match",
};

/** Validate + map the parsed CSV rows against the distributor's current data. */
export function runDryRun(
  rows: string[][],
  columnMap: Record<string, string>,
  ctx: DryRunContext,
): DryRunResult {
  const records: MappedRecord[] = [];
  const errors: RowError[] = [];
  if (rows.length < 2) {
    return { records, errors, counts: { rows: 0, created: 0, updated: 0, skipped: 0 }, protectedCounts: { owner: 0, pdm: 0, fu: 0 } };
  }

  const headers = rows[0];
  const fieldOf = headers.map((h) => columnMap[h] ?? "");
  const seen = new Set<string>();
  let rowCount = 0;

  for (let r = 1; r < rows.length; r++) {
    rowCount++;
    const cells = rows[r];
    const rec: Record<string, string> = {};
    fieldOf.forEach((f, c) => { if (f) rec[f] = (cells[c] ?? "").trim(); });

    const externalId = rec.external_id ?? "";
    const rowNum = r + 1;
    const fail = (code: ErrorCode, detail: string) => errors.push({ row: rowNum, externalId, code, issue: ISSUE[code], detail });

    // Required fields present?
    const missing = REQUIRED_FIELDS.find((k) => !(rec[k] && rec[k].trim()));
    if (missing) { fail("missing_required", `${missing.replace(/_/g, " ")} is empty`); continue; }

    if (!/^\d{5}$/.test(rec.zip)) { fail("bad_zip", `"${rec.zip}" needs five digits`); continue; }

    const score = parseFloat(rec.priority_score);
    if (!Number.isFinite(score) || score < 0 || score > 5) { fail("invalid_priority", `${rec.priority_score} is outside 0–5`); continue; }

    const ownerEmail = (rec.owner_email ?? "").trim().toLowerCase();
    let ownerUserId: string | null = null;
    if (ownerEmail) {
      ownerUserId = ctx.repEmailToId.get(ownerEmail) ?? null;
      if (!ownerUserId) { fail("unknown_owner", `${rec.owner_email} is not a rep here`); continue; }
    }

    const sourceProgramId = ctx.programCodeToId.get(rec.program_code.trim()) ?? null;
    if (!sourceProgramId) { fail("conflicting_program", `${rec.program_code} is not a program for this distributor`); continue; }

    if (seen.has(externalId)) { fail("duplicate_id", "Appears more than once in the file"); continue; }
    seen.add(externalId);

    const existing = ctx.existingByExtId.get(externalId);
    if (!existing) {
      const collide = ctx.nameAddrToExtIds.get(nameAddrKey(rec.company_name, rec.address ?? null)) ?? [];
      if (collide.length > 0 && !collide.includes(externalId)) {
        fail("ambiguous_match", `Matches ${collide.length} existing compan${collide.length === 1 ? "y" : "ies"} by name and address; resolve before import`);
        continue;
      }
    }

    records.push({
      row: rowNum,
      externalId,
      isUpdate: !!existing,
      ownerUserId,
      sourceProgramId,
      fields: {
        name: rec.company_name,
        address: rec.address || null,
        city: rec.city || null,
        state: rec.state || null,
        zip: rec.zip || null,
        phone: rec.phone || null,
        website: rec.website || null,
        industryPrimary: rec.vio_industry || null,
        industrySub: rec.vio_subcategory || null,
        totalVehicles: rec.total_vehicles ? toInt(rec.total_vehicles) : null,
        truckCount: rec.truck_count ? toInt(rec.truck_count) : null,
        vanCount: rec.van_count ? toInt(rec.van_count) : null,
        fleetMix: rec.model_mix || null,
        priorityScore: score.toFixed(1),
        priorityExplanation: rec.priority_note || null,
        touchIntervalDays: rec.touch_interval_days ? toInt(rec.touch_interval_days) : null,
      },
    });
  }

  const updates = records.filter((x) => x.isUpdate);
  const protectedCounts = { owner: 0, pdm: 0, fu: 0 };
  for (const u of updates) {
    const ex = ctx.existingByExtId.get(u.externalId)!;
    if (ex.ownerUserId) protectedCounts.owner++;
    if (ex.hasDm) protectedCounts.pdm++;
    if (ex.hasFollowUp) protectedCounts.fu++;
  }

  return {
    records,
    errors,
    counts: {
      rows: rowCount,
      created: records.filter((x) => !x.isUpdate).length,
      updated: updates.length,
      skipped: errors.length,
    },
    protectedCounts,
  };
}
