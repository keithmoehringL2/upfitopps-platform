// Shared, serializable shape of a distributor's manager settings. Lives in
// distributor.settings (jsonb). No server-only imports so it is safe to use from
// client components too. Matches the Manager prototype's Settings section.

export type CadenceKey =
  | "no_answer"
  | "voicemail"
  | "gatekeeper"
  | "decision_maker"
  | "not_interested"
  | "wrong_number";

// Default follow-up interval per outcome (days) — used when a rep logs an
// outcome without choosing a date. A rep-chosen date overrides it. Wrong Number
// has no cadence: it creates no follow-up and alerts L2 Digital instead.
export const CADENCE_ROWS: { key: CadenceKey; label: string }[] = [
  { key: "no_answer", label: "No Answer" },
  { key: "voicemail", label: "Left Voicemail" },
  { key: "gatekeeper", label: "Spoke to Gatekeeper" },
  { key: "decision_maker", label: "Spoke to Decision-Maker" },
  { key: "not_interested", label: "Not interested now" },
  { key: "wrong_number", label: "Wrong Number" },
];

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const SEND_TIMES = ["6:00 AM", "6:30 AM", "7:00 AM", "7:30 AM", "8:00 AM"] as const;
export const SUMMARY_TIMES = ["6:00 AM", "7:00 AM", "5:00 PM", "6:00 PM"] as const;
export const SUMMARY_DAYS = ["Monday", "Friday"] as const;
export const STARTER_LENGTHS = [3, 5, 10] as const;

export interface ManagerSettings {
  cadence: Record<CadenceKey, number | null>;
  // Parking cycle: after this many non-terminal outreach attempts, a prospect
  // logged without a rep-set follow-up date is parked for parkDays before it
  // re-enters the Prospects queue. A rep-set follow-up date overrides parking.
  parking: { attemptsBeforeParking: number; parkDays: number };
  customer: { snoozeDays: number; remindersInDailyEmail: boolean };
  repEmail: { send: boolean; days: string[]; time: string; starterLength: number };
  summary: {
    frequency: "daily" | "weekly";
    day: string;
    time: string;
    recipients: string[];
    compareTrend: boolean;
  };
  leaderboard: { enabled: boolean };
}

export function defaultSettings(): ManagerSettings {
  return {
    cadence: { no_answer: 3, voicemail: 5, gatekeeper: 7, decision_maker: 14, not_interested: 60, wrong_number: null },
    parking: { attemptsBeforeParking: 4, parkDays: 90 },
    customer: { snoozeDays: 7, remindersInDailyEmail: true },
    repEmail: { send: true, days: ["Mon", "Tue", "Wed", "Thu", "Fri"], time: "7:00 AM", starterLength: 5 },
    summary: { frequency: "weekly", day: "Monday", time: "7:00 AM", recipients: [], compareTrend: true },
    leaderboard: { enabled: true },
  };
}

const posInt = (v: unknown, def: number) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : def;
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
const str = (v: unknown, allowed: readonly string[], def: string) =>
  typeof v === "string" && allowed.includes(v) ? v : def;

/** Merge stored settings over defaults, validating every field. */
export function mergeSettings(raw: unknown): ManagerSettings {
  const d = defaultSettings();
  const s = (raw ?? {}) as Record<string, unknown>;
  const cad = (s.cadence ?? {}) as Record<string, unknown>;
  const pk = (s.parking ?? {}) as Record<string, unknown>;
  const cust = (s.customer ?? {}) as Record<string, unknown>;
  const re = (s.repEmail ?? {}) as Record<string, unknown>;
  const sum = (s.summary ?? {}) as Record<string, unknown>;
  const lb = (s.leaderboard ?? {}) as Record<string, unknown>;

  const cadence = { ...d.cadence };
  for (const { key } of CADENCE_ROWS) {
    const v = cad[key];
    if (v === null) cadence[key] = null;
    else if (typeof v === "number" && Number.isFinite(v) && v > 0) cadence[key] = Math.round(v);
  }

  const days = Array.isArray(re.days)
    ? (re.days as unknown[]).filter((x): x is string => typeof x === "string" && (DAYS as readonly string[]).includes(x))
    : d.repEmail.days;
  const recipients = Array.isArray(sum.recipients)
    ? (sum.recipients as unknown[]).filter((x): x is string => typeof x === "string" && x.includes("@"))
    : d.summary.recipients;

  return {
    cadence,
    parking: {
      attemptsBeforeParking: posInt(pk.attemptsBeforeParking, d.parking.attemptsBeforeParking),
      parkDays: posInt(pk.parkDays, d.parking.parkDays),
    },
    customer: {
      snoozeDays: posInt(cust.snoozeDays, d.customer.snoozeDays),
      remindersInDailyEmail: bool(cust.remindersInDailyEmail, d.customer.remindersInDailyEmail),
    },
    repEmail: {
      send: bool(re.send, d.repEmail.send),
      days,
      time: str(re.time, SEND_TIMES, d.repEmail.time),
      starterLength: STARTER_LENGTHS.includes(re.starterLength as 3 | 5 | 10)
        ? (re.starterLength as number)
        : d.repEmail.starterLength,
    },
    summary: {
      frequency: sum.frequency === "daily" ? "daily" : "weekly",
      day: str(sum.day, SUMMARY_DAYS, d.summary.day),
      time: str(sum.time, SUMMARY_TIMES, d.summary.time),
      recipients,
      compareTrend: bool(sum.compareTrend, d.summary.compareTrend),
    },
    leaderboard: { enabled: bool(lb.enabled, d.leaderboard.enabled) },
  };
}
