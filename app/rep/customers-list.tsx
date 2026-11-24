"use client";

import Link from "next/link";

export interface CustomerRow {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  lastTouchDate: string | null;
  dueDate: string;
  note: string | null;
}

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function overdueDays(dueDate: string, today: string): number {
  return Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(dueDate + "T00:00:00").getTime()) / 86_400_000,
  );
}

// Past customers whose check-in is due. These never count toward the prospect
// goal. ("Done today" tracking + richer cadence tags land in the next phase.)
export function CustomersList({ due }: { due: CustomerRow[] }) {
  const today = new Date().toISOString().slice(0, 10);

  if (due.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "2px 0 0" }}>No customer check-ins due.</p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {due.map((c) => {
        const over = c.dueDate < today;
        const meta = [c.city, c.industryPrimary].filter(Boolean).join(" · ");
        return (
          <Link
            key={c.id}
            href={`/rep/company/${c.id}`}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "12px 0",
              borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, minWidth: 0 }}>{c.name}</span>
              <span
                className={over ? "tag tag-accent-2" : undefined}
                style={{ flex: "none", fontSize: over ? 11 : 12, fontWeight: 600, color: over ? undefined : "var(--neutral-800)" }}
              >
                {over ? `${overdueDays(c.dueDate, today)}d overdue` : "Due today"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{meta || "Customer"}</span>
              {c.lastTouchDate && (
                <span className="tag" style={{ fontSize: 11 }}>Last: {fmt(c.lastTouchDate)}</span>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
