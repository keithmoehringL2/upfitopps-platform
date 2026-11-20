"use client";

import { useActionState, useState } from "react";
import { logOutcome, type LogState } from "@/lib/rep/actions";
import { FOLLOW_UP_OPTIONS, OUTCOMES } from "@/lib/rep/outcomes";

const TODAY = new Date().toISOString().slice(0, 10);
function daysFromToday(dateStr: string): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00").getTime() - new Date(TODAY + "T00:00:00").getTime();
  const d = Math.round(ms / 86_400_000);
  return d > 0 ? d : null;
}

export function LogOutcomeForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState<LogState | undefined, FormData>(
    logOutcome,
    undefined,
  );
  const [outcome, setOutcome] = useState<string>("");
  const [who, setWho] = useState("");
  const [notInterested, setNotInterested] = useState(false);
  const [note, setNote] = useState("");
  const [followUpDays, setFollowUpDays] = useState<number | null>(null);
  const [fuDate, setFuDate] = useState("");
  const [opportunity, setOpportunity] = useState(false);
  const [removeOn, setRemoveOn] = useState(false);
  const [removeKind, setRemoveKind] = useState<"remove" | "dnc">("remove");

  const isGk = outcome === "gatekeeper";
  const isDm = outcome === "decision_maker";

  // Compose the note the way the prototype does for gatekeeper calls.
  const composedNote = isGk && who.trim() ? `Spoke with ${who.trim()}. ${note}`.trim() : note;

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="outcome" value={outcome} />
      <input type="hidden" name="note" value={composedNote} />
      <input type="hidden" name="notInterested" value={isDm && notInterested ? "1" : ""} />
      <input type="hidden" name="followUpDays" value={followUpDays ?? ""} />
      <input type="hidden" name="opportunity" value={opportunity ? "1" : ""} />
      <input type="hidden" name="remove" value={removeOn ? removeKind : ""} />

      {/* Outcome tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {OUTCOMES.map((o) => {
          const active = outcome === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setOutcome(active ? "" : o.value);
                setFollowUpDays(null);
                setFuDate("");
              }}
              className={`btn ${active ? "btn-primary" : "btn-secondary"}`}
              style={{
                minHeight: 72,
                justifyContent: "flex-start",
                textAlign: "left",
                fontSize: 16,
                lineHeight: 1.2,
                padding: "12px 14px",
                gap: 10,
              }}
            >
              <i className={`ph-duotone ${o.icon}`} style={{ fontSize: 26, flex: "none" }} />
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>

      {outcome && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 6 }}>
          {isGk && (
            <div className="field">
              <label>Who did you speak with? (optional)</label>
              <input
                className="input"
                value={who}
                onChange={(e) => setWho(e.target.value)}
                placeholder="Name or role"
                style={{ minHeight: 44, fontSize: 15 }}
              />
            </div>
          )}

          {isDm && (
            <div className="seg" style={{ alignSelf: "flex-start" }}>
              <label className="seg-opt" style={{ padding: "12px 14px", minHeight: 44 }}>
                <input type="radio" name="dmi" checked={!notInterested} onChange={() => setNotInterested(false)} />
                Keep following up
              </label>
              <label className="seg-opt" style={{ padding: "12px 14px", minHeight: 44 }}>
                <input type="radio" name="dmi" checked={notInterested} onChange={() => setNotInterested(true)} />
                Not interested now
              </label>
            </div>
          )}

          <div className="field">
            <label>Note (optional)</label>
            <textarea
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What happened?"
              style={{ minHeight: 72, fontSize: 15 }}
            />
          </div>

          {/* Follow-up */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--neutral-800)" }}>Follow-up</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FOLLOW_UP_OPTIONS.map((f) => {
                const active = followUpDays === f.days && !fuDate;
                return (
                  <button
                    key={f.days}
                    type="button"
                    onClick={() => {
                      setFollowUpDays(active ? null : f.days);
                      setFuDate("");
                    }}
                    className={`btn ${active ? "btn-primary" : "btn-secondary"}`}
                    style={{ minHeight: 44, fontSize: 14 }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <input
              className="input"
              type="date"
              value={fuDate}
              min={TODAY}
              onChange={(e) => {
                setFuDate(e.target.value);
                setFollowUpDays(daysFromToday(e.target.value));
              }}
              style={{ minHeight: 44, fontSize: 15 }}
            />
          </div>

          {/* Opportunity toggle */}
          <Toggle
            label="Opportunity identified"
            sub="Interest and initial fact-finding done. Leaves the cold queue."
            on={opportunity}
            onToggle={() => setOpportunity((v) => !v)}
          />

          {/* Remove toggle */}
          <Toggle
            label="Remove from outreach"
            sub="Stop prospecting this company. History is kept."
            on={removeOn}
            onToggle={() => setRemoveOn((v) => !v)}
          />
          {removeOn && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 2 }}>
              <label className="radio" style={{ alignItems: "flex-start", fontSize: 15, display: "inline-flex", gap: 8 }}>
                <input type="radio" name="rm" checked={removeKind === "remove"} onChange={() => setRemoveKind("remove")} />
                <span>
                  <strong>Remove from outreach.</strong> A manager can restore it.
                </span>
              </label>
              <label className="radio" style={{ alignItems: "flex-start", fontSize: 15, display: "inline-flex", gap: 8 }}>
                <input type="radio" name="rm" checked={removeKind === "dnc"} onChange={() => setRemoveKind("dnc")} />
                <span>
                  <strong>Do not contact.</strong> Permanent. Imports can&rsquo;t reactivate it.
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {state?.error && (
        <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{state.error}</p>
      )}

      {/* Persistent action bar — pinned to the bottom of the mobile column so
          it stays put regardless of the Decision-Maker / Quote sections that
          follow this form in the page. */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 480,
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
          background: "var(--accent-500)",
          boxShadow: "0 -1px 0 color-mix(in srgb, var(--text) 12%, transparent)",
        }}
      >
        <a
          href="/rep"
          className="btn"
          style={{ minHeight: 48, padding: "0 14px", color: "var(--bg)", fontWeight: 400, opacity: 0.85 }}
        >
          Skip
        </a>
        <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: "var(--bg)", opacity: 0.85 }}>
          {outcome ? "Saves and moves on" : "Pick an outcome"}
        </span>
        <button
          type="submit"
          disabled={pending || !outcome}
          className="btn"
          style={{
            minHeight: 48,
            padding: "0 22px",
            background: "var(--bg)",
            color: "var(--accent-800)",
            fontSize: 16,
            opacity: pending || !outcome ? 0.6 : 1,
          }}
        >
          <span>{pending ? "Saving…" : "Save & next"}</span>
          <i className="ph-duotone ph-arrow-right" />
        </button>
      </div>
    </form>
  );
}

function Toggle({
  label,
  sub,
  on,
  onToggle,
}: {
  label: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14, minHeight: 56 }}
    >
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{sub}</span>
      </div>
      <div
        style={{
          flex: "none",
          width: 50,
          height: 30,
          borderRadius: 15,
          background: on ? "var(--accent-500)" : "var(--neutral-300)",
          position: "relative",
          transition: "background .2s",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: on ? 23 : 3,
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "var(--shadow-sm)",
            transition: "left .2s",
          }}
        />
      </div>
    </div>
  );
}
