"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSkipped, markSkipped, getDaySnapshot } from "@/lib/rep/session-state";

// The rep's Follow-up Queue: rep-set and system-assigned follow-ups. Rows stay
// here until acted on or skipped; overdue rows show a "Past due" flag. Worked
// rows stay visible as "Done today" (dimmed, sorted to the bottom) so the
// counter makes sense. Skip defers a row for the day. These never count toward
// the daily prospecting goal.

export interface Reminder {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
  lastTouchDate: string | null;
  dueDate: string;
  note: string | null;
  source?: "rep" | "system" | null;
  reason?: string | null;
  intervalDays?: number | null;
  kind: "follow_up" | "touch_base";
}

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function overdueDays(dueDate: string, today: string): number {
  return Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(dueDate + "T00:00:00").getTime()) / 86_400_000,
  );
}

function SourceTag({ r }: { r: Reminder }) {
  if (r.source === "rep") {
    return (
      <span className="tag tag-accent" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <i className="ph-duotone ph-user" style={{ fontSize: 12 }} /> Rep-set
      </span>
    );
  }
  if (r.source === "system") {
    return (
      <span className="tag" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <i className="ph-duotone ph-gear" style={{ fontSize: 12 }} /> Auto{r.reason ? ` · ${r.reason}` : ""}
      </span>
    );
  }
  return null;
}

export function FollowUps({
  due,
  upcoming,
  doneIds = [],
}: {
  due: Reminder[];
  upcoming: Reminder[];
  doneIds?: string[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [snap, setSnap] = useState<Reminder[]>(due);

  useEffect(() => {
    setSkipped(getSkipped());
    setSnap(getDaySnapshot("followups", due));
  }, [due]);

  const done = new Set(doneIds);
  const openRows = snap.filter((r) => !done.has(r.id) && !skipped.has(r.id));
  const doneRows = snap.filter((r) => done.has(r.id));
  const upcomingVisible = upcoming.filter((r) => !skipped.has(r.id) && !done.has(r.id));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {openRows.length === 0 && doneRows.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "2px 0 0" }}>Nothing due today.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {openRows.map((r) => {
            const over = r.dueDate < today;
            const meta = [r.city, r.industryPrimary].filter(Boolean).join(" · ");
            return (
              <div key={r.id} style={{ padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}>
                <Link href={`/rep/company/${r.id}`} style={{ display: "flex", flexDirection: "column", gap: 4, textDecoration: "none", color: "inherit" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, minWidth: 0 }}>{r.name}</span>
                    {over ? (
                      <span className="tag tag-accent-2" style={{ flex: "none", fontSize: 11, fontWeight: 600 }}>
                        Past due · {overdueDays(r.dueDate, today)}d
                      </span>
                    ) : (
                      <span style={{ flex: "none", fontSize: 12, fontWeight: 600, color: "var(--neutral-800)" }}>Due today</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <SourceTag r={r} />
                    {meta && <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{meta}</span>}
                    {r.lastTouchDate && <span className="tag" style={{ fontSize: 11 }}>Last: {fmt(r.lastTouchDate)}</span>}
                  </div>
                  {r.note && <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--neutral-700)" }}>{r.note}</span>}
                </Link>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
                  <button type="button" onClick={() => { markSkipped(r.id); setSkipped((s) => new Set(s).add(r.id)); }} className="btn btn-ghost" style={{ fontSize: 13, minHeight: 36, padding: "0 8px" }}>
                    Skip for today
                  </button>
                </div>
              </div>
            );
          })}

          {doneRows.map((r) => (
            <Link
              key={r.id}
              href={`/rep/company/${r.id}`}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)", textDecoration: "none", color: "inherit", opacity: 0.5 }}
            >
              <i className="ph-duotone ph-check-circle" style={{ fontSize: 18, color: "var(--accent-700)", flex: "none" }} />
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600, textDecoration: "line-through" }}>{r.name}</span>
                <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Done today</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {upcomingVisible.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-800)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Upcoming</span>
          {upcomingVisible.map((r) => (
            <Link key={r.id} href={`/rep/company/${r.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, padding: "9px 0", textDecoration: "none", color: "inherit" }}>
              <span style={{ fontSize: 15, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
                {r.source === "system" && <span className="tag" style={{ fontSize: 10 }}>Auto</span>}
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
