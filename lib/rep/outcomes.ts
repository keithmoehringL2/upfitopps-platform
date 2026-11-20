// The outcomes a rep can log and what each one does to the prospect's cadence
// and lifecycle. Single source of truth shared by the gateway (which applies the
// effects) and the UI (which renders the buttons). Keep in sync with the
// interaction_outcome / interaction_channel enums in lib/db/schema.ts.

export type OutcomeValue =
  | "connected"
  | "left_message"
  | "no_answer"
  | "callback"
  | "meeting_set"
  | "not_interested"
  | "do_not_contact"
  | "bad_contact";

export type ChannelValue = "call" | "email" | "text" | "visit";

export type OutcomeTone = "win" | "positive" | "neutral" | "negative";

export interface OutcomeMeta {
  value: OutcomeValue;
  label: string;
  tone: OutcomeTone;
  /** Days until the prospect is eligible again. Omitted when it is removed. */
  nextDays?: number;
  /** Lifecycle transition to apply, if any. */
  lifecycle?: "opp";
  /** Suppression to apply (drops it out of the queue permanently). */
  suppress?: "dnc" | "remove";
}

export const OUTCOMES: readonly OutcomeMeta[] = [
  { value: "connected", label: "Connected", tone: "positive", nextDays: 14 },
  { value: "meeting_set", label: "Meeting set", tone: "win", nextDays: 30, lifecycle: "opp" },
  { value: "callback", label: "Callback set", tone: "positive", nextDays: 7 },
  { value: "left_message", label: "Left message", tone: "neutral", nextDays: 3 },
  { value: "no_answer", label: "No answer", tone: "neutral", nextDays: 2 },
  { value: "not_interested", label: "Not interested", tone: "negative", nextDays: 90 },
  { value: "do_not_contact", label: "Do not contact", tone: "negative", suppress: "dnc" },
  { value: "bad_contact", label: "Bad contact info", tone: "negative", suppress: "remove" },
] as const;

export const CHANNELS: readonly { value: ChannelValue; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "text", label: "Text" },
  { value: "visit", label: "Visit" },
] as const;

const OUTCOME_BY_VALUE = new Map(OUTCOMES.map((o) => [o.value, o]));

export function outcomeMeta(value: string): OutcomeMeta | undefined {
  return OUTCOME_BY_VALUE.get(value as OutcomeValue);
}

export function isOutcome(value: string): value is OutcomeValue {
  return OUTCOME_BY_VALUE.has(value as OutcomeValue);
}

export function isChannel(value: string): value is ChannelValue {
  return CHANNELS.some((c) => c.value === value);
}
