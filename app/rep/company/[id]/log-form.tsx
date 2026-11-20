"use client";

import { useActionState, useState } from "react";
import { logOutcome, type LogState } from "@/lib/rep/actions";
import { CHANNELS, OUTCOMES, type OutcomeTone } from "@/lib/rep/outcomes";

const TONE_BG: Record<OutcomeTone, string> = {
  win: "var(--accent-500)",
  positive: "var(--accent-500)",
  neutral: "var(--neutral-800)",
  negative: "var(--neutral-800)",
};

export function LogOutcomeForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<LogState | undefined, FormData>(
    logOutcome,
    undefined,
  );
  const [outcome, setOutcome] = useState<string>("");
  const [channel, setChannel] = useState<string>("call");

  return (
    <form action={action} style={{ marginTop: 8 }}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="outcome" value={outcome} />
      <input type="hidden" name="channel" value={channel} />

      {/* Channel */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {CHANNELS.map((c) => {
          const active = channel === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setChannel(c.value)}
              style={{
                flex: 1,
                padding: "9px 6px",
                fontSize: 14,
                fontFamily: "inherit",
                fontWeight: active ? 600 : 400,
                color: active ? "#fff" : "var(--neutral-700)",
                background: active ? "var(--neutral-800)" : "#fff",
                border: `1px solid ${active ? "var(--neutral-800)" : "var(--neutral-300)"}`,
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Outcome chips */}
      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)", marginBottom: 8 }}>
        Outcome
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {OUTCOMES.map((o) => {
          const active = outcome === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setOutcome(o.value)}
              style={{
                padding: "12px 10px",
                fontSize: 14,
                fontFamily: "inherit",
                fontWeight: active ? 600 : 400,
                textAlign: "left",
                color: active ? "#fff" : "var(--neutral-800)",
                background: active ? TONE_BG[o.tone] : "#fff",
                border: `1px solid ${active ? TONE_BG[o.tone] : "var(--neutral-300)"}`,
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      <textarea
        name="note"
        placeholder="Add a note (optional)"
        rows={3}
        style={{
          display: "block",
          width: "100%",
          marginTop: 16,
          padding: "12px 14px",
          fontSize: 16,
          fontFamily: "inherit",
          border: "1px solid var(--neutral-300)",
          borderRadius: "var(--radius-lg)",
          resize: "vertical",
          background: "#fff",
        }}
      />

      {state?.error && (
        <p style={{ color: "var(--accent-700)", fontSize: 14, margin: "12px 0 0" }}>{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !outcome}
        style={{
          marginTop: 16,
          width: "100%",
          padding: "15px 16px",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          color: "#fff",
          background: "var(--accent-500)",
          border: "none",
          borderRadius: "var(--radius-lg)",
          cursor: pending || !outcome ? "not-allowed" : "pointer",
          opacity: pending || !outcome ? 0.5 : 1,
        }}
      >
        {pending ? "Logging…" : "Log & next prospect"}
      </button>
    </form>
  );
}
