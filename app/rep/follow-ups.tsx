"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSkipped, markSkipped } from "@/lib/rep/session-state";

// The rep's Follow-up Queue: rep-set promises (highest priority) and No-Contact
// Retries, plus customer touch-base reminders. Rows stay here until acted on or
// skipped; overdue rows show a "Past due" flag. Skip defers a row for the day
// (it returns tomorrow, still due) — it never resolves the commitment. These
// never count toward the daily cold-prospecting goal.

interface Reminder {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
  lastTouchDate: string | null;
  dueDate: string;
  note: string | null;
  kind: "follow_up" | "no_contact_retry" | "touch_base";
}

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function overdueDays(dueDate: string, today: string): number {
  return Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(dueDate + "T00:00:00").getTime()) /
      86_400_000,
  );
}

const KIND_LABEL: Record<Reminder["kind"], string | null> = {
  follow_up: "Promised",
  no_contact_retry: "Retry",
  touch_base: "Customer",
};

export function FollowUps({ due, upcoming }: { due: Reminder[]; upcoming: Reminder[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  // Device-local skip state read after mount (avoids a hydration gap).
  useEffect(() => {
    setSkipped(getSkipped());
  }, []);

  function skip(id: string) {
    markSkipped(id);
    setSkipped((s) => new Set(s).add(id));
  }

  const dueVisible = due.filter((r) => !skipped.has(r.id));
  const upcomingVisible = upcoming.filter((r) => !skipped.has(r.id));

  return (
    <section id="followups" style={{ display: "flex", flexDirection: "column", gap: 10, scrollMarginTop: 120 }}>
      <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
        <i className="ph-duotone ph-bell-ringing" style={{ fontSize: 26 }} />
        <span>Follow-ups</span>
      </h3>

      {dueVisible.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "2px 0 0" }}>Nothing due today.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {dueVisible.map((r) => {
            const over = r.dueDate < today;
            const kindLabel = KIND_LABEL[r.kind];
            return (
              <div
                key={r.id}
                style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}
              >
                <Link
                  href={`/rep/company/${r.id}`}
                  style={{ display: "flex", flexDirection: "column", gap: 4, textDecoration: "none", color: "inherit" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, minWidth: 0 }}>{r.name}</span>
                    {over ? (
                      <span
                        className="tag tag-accent-2"
                        style={{ flex: "none", fontSize: 11, fontWeight: 600 }}
                      >
                        Past due · {overdueDays(r.dueDate, today)}d
                      </span>
                    ) : (
                      <span style={{ flex: "none", fontSize: 12, fontWeight: 600, color: "var(--neutral-800)" }}>Due today</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {kindLabel && r.kind !== "touch_base" && (
                      <span className="tag tag-accent" style={{ fontSize: 11 }}>{kindLabel}</span>
                    )}
                    <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
                      {[r.city, r.kind === "touch_base" ? "Customer" : r.industryPrimary].filter(Boolean).join(" · ")}
                    </span>
                    {r.lastTouchDate && (
                      <span className="tag" style={{ fontSize: 11 }}>Last: {fmt(r.lastTouchDate)}</span>
                    )}
                  </div>
                  {r.note && (
                    <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--neutral-700)" }}>{r.note}</span>
                  )}
                </Link>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => skip(r.id)}
                    className="btn btn-ghost"
                    style={{ fontSize: 13, minHeight: 36, padding: "0 8px" }}
                  >
                    Skip for today
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {upcomingVisible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-800)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Upcoming
          </span>
          {upcomingVisible.map((r) => (
            <Link
              key={r.id}
              href={`/rep/company/${r.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                padding: "9px 0",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{ fontSize: 15, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
                {r.kind === "no_contact_retry" && (
                  <span className="tag tag-accent" style={{ fontSize: 10 }}>Retry</span>
                )}
                {r.name}
              </span>
              <span style={{ flex: "none", fontSize: 13, color: "var(--neutral-700)" }}>{fmt(r.dueDate)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
