// The call outcomes a rep logs, matching the design handoff's Rep Mobile
// prototype exactly (labels, Phosphor icons, and default cadences in days).
// Single source of truth shared by the gateway (which applies the effects) and
// the UI (which renders the tiles). Keep in sync with the interaction_outcome
// enum in lib/db/schema.ts.

export type OutcomeValue =
  | "no_answer"
  | "voicemail"
  | "gatekeeper"
  | "decision_maker"
  | "wrong_number";

export interface OutcomeMeta {
  value: OutcomeValue;
  label: string;
  /** Phosphor duotone icon class (without the ph-duotone prefix). */
  icon: string;
  /** Default days until eligible again; null = no follow-up (stays out). */
  cadenceDays: number | null;
}

export const OUTCOMES: readonly OutcomeMeta[] = [
  { value: "no_answer", label: "No Answer", icon: "ph-phone-slash", cadenceDays: 3 },
  { value: "voicemail", label: "Left Voicemail", icon: "ph-voicemail", cadenceDays: 5 },
  { value: "gatekeeper", label: "Spoke to Gatekeeper", icon: "ph-user-switch", cadenceDays: 7 },
  { value: "decision_maker", label: "Spoke to Decision-Maker", icon: "ph-handshake", cadenceDays: 14 },
  { value: "wrong_number", label: "Wrong Number", icon: "ph-phone-x", cadenceDays: null },
] as const;

/** "Not interested now" under Decision-Maker uses the manager's longer setting. */
export const NOT_INTERESTED_CADENCE_DAYS = 60;

/** Quick follow-up chips (days from today). An explicit date overrides cadence. */
export const FOLLOW_UP_OPTIONS: readonly { days: number; label: string }[] = [
  { days: 1, label: "Tomorrow" },
  { days: 7, label: "1 Week" },
  { days: 14, label: "2 Weeks" },
] as const;

const OUTCOME_BY_VALUE = new Map(OUTCOMES.map((o) => [o.value, o]));

export function outcomeMeta(value: string): OutcomeMeta | undefined {
  return OUTCOME_BY_VALUE.get(value as OutcomeValue);
}

export function isOutcome(value: string): value is OutcomeValue {
  return OUTCOME_BY_VALUE.has(value as OutcomeValue);
}

/** Icons for non-outcome activity events shown in the company timeline. */
export const EVENT_ICONS: Record<string, { label: string; icon: string }> = {
  opp: { label: "Opportunity identified", icon: "ph-flag-banner" },
  remove: { label: "Removed from outreach", icon: "ph-prohibit" },
  dnc: { label: "Marked Do Not Contact", icon: "ph-hand-palm" },
};
