"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDaySnapshot } from "@/lib/rep/session-state";

export interface CustomerRow {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  lastTouchDate: string | null;
  dueDate: string;
  intervalDays: number | null;
  note: string | null;
}

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function days(a: string, b: string): number {
  return Math.round((new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86_400_000);
}

// Past customers whose check-in is due. Worked rows stay visible as "Checked in
// today" (dimmed, at the bottom). These never count toward the prospect goal.
export function CustomersList({ due, doneIds = [] }: { due: CustomerRow[]; doneIds?: string[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const [snap, setSnap] = useState<CustomerRow[]>(due);

  useEffect(() => {
    setSnap(getDaySnapshot("customers", due));
  }, [due]);

  const done = new Set(doneIds);
  const openRows = snap.filter((c) => !done.has(c.id));
  const doneRows = snap.filter((c) => done.has(c.id));

  if (openRows.length === 0 && doneRows.length === 0) {
    return <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "2px 0 0" }}>No customer check-ins due.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {openRows.map((c) => {
        const over = c.dueDate < today;
        const meta = [c.city, c.industryPrimary].filter(Boolean).join(" · ");
        const sinceTouch = c.lastTouchDate ? days(today, c.lastTouchDate) : null;
        return (
          <Link
            key={c.id}
            href={`/rep/company/${c.id}`}
            style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, minWidth: 0 }}>{c.name}</span>
              {over ? (
                <span className="tag tag-accent-2" style={{ flex: "none", fontSize: 11, fontWeight: 600 }}>{days(today, c.dueDate)}d overdue</span>
              ) : (
                <span style={{ flex: "none", fontSize: 12, fontWeight: 600, color: "var(--neutral-800)" }}>Due today</span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{meta || "Customer"}</span>
              {c.intervalDays != null && <span className="tag" style={{ fontSize: 11 }}>Every {c.intervalDays} days</span>}
              {c.lastTouchDate && <span className="tag" style={{ fontSize: 11 }}>Last: {fmt(c.lastTouchDate)}</span>}
            </div>
            {sinceTouch != null && (
              <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Last check-in {sinceTouch} days ago</span>
            )}
          </Link>
        );
      })}

      {doneRows.map((c) => (
        <Link
          key={c.id}
          href={`/rep/company/${c.id}`}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)", textDecoration: "none", color: "inherit", opacity: 0.5 }}
        >
          <i className="ph-duotone ph-check-circle" style={{ fontSize: 18, color: "var(--accent-700)", flex: "none" }} />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 600, textDecoration: "line-through" }}>{c.name}</span>
            <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Checked in today</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
