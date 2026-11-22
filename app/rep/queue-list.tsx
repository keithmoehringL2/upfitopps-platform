"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSkipped } from "@/lib/rep/session-state";
import { pendingCompanyIds } from "@/lib/rep/outbox";

export interface QueueRow {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
}

// The day's Cold Prospects, in the stable queue order, stopping at the daily
// target. Worked rows (an outcome logged today, or a pending offline log) show a
// check and drop to 50% opacity; skipped rows show an undo icon. "Keep Going"
// below the list opens the next prospect beyond the day's set.
export function QueueList({
  rows,
  doneIds,
  target,
}: {
  rows: QueueRow[];
  doneIds: string[];
  target: number | null;
}) {
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Device-local state read after mount to avoid a hydration gap: skipped rows
  // (localStorage) and outcomes logged offline awaiting sync (IndexedDB outbox).
  useEffect(() => {
    setSkipped(getSkipped());
    pendingCompanyIds().then((ids) => setPending(new Set(ids)));
  }, []);

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 14, color: "var(--neutral-700)", padding: "16px 0" }}>
        Your queue is clear. Nice work — new prospects appear here once assigned.
      </p>
    );
  }

  const daySize = target && target > 0 ? Math.min(rows.length, target) : rows.length;
  const visible = rows.slice(0, daySize);
  const doneSet = new Set(doneIds);
  // A pending offline outcome counts as done (it syncs on reconnect).
  const statusOf = (id: string): "done" | "skipped" | "open" =>
    doneSet.has(id) || pending.has(id) ? "done" : skipped.has(id) ? "skipped" : "open";

  // The next prospect to open past the day's set — the first un-worked one.
  const beyond = rows.slice(daySize);
  const nextBeyond = beyond.find((r) => statusOf(r.id) === "open") ?? beyond[0];
  const allWorked = visible.every((r) => statusOf(r.id) !== "open");

  return (
    <>
      {visible.map((c, i) => {
        const status = statusOf(c.id);
        const meta = [c.city, c.industryPrimary].filter(Boolean).join(" · ");
        const metaSuffix = status === "skipped" ? " · skipped" : "";
        return (
          <Link
            key={c.id}
            href={`/rep/company/${c.id}`}
            style={{
              cursor: "pointer",
              display: "grid",
              gridTemplateColumns: "26px minmax(0,1fr) auto 16px",
              gap: 12,
              alignItems: "center",
              padding: "12px 8px",
              margin: "0 -8px",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              color: "inherit",
              opacity: status === "done" ? 0.5 : 1,
            }}
          >
            <span style={{ fontSize: 17, color: "var(--neutral-600)" }}>{i + 1}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, textDecoration: status === "done" ? "line-through" : "none" }}>
                {c.name}
              </span>
              <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
                {meta}
                {metaSuffix}
              </span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 600 }}>{c.priorityScore ?? "—"}</span>
            {status === "done" ? (
              <i className="ph-duotone ph-check-circle" style={{ fontSize: 18, color: "var(--accent-700)" }} />
            ) : status === "skipped" ? (
              <i className="ph-duotone ph-arrow-u-up-left" style={{ fontSize: 16, color: "var(--neutral-600)" }} />
            ) : (
              <i className="ph-duotone ph-caret-right" style={{ fontSize: 16, color: "var(--neutral-600)" }} />
            )}
          </Link>
        );
      })}

      {nextBeyond ? (
        <Link
          href={`/rep/company/${nextBeyond.id}`}
          className="btn btn-secondary"
          style={{ marginTop: 12, minHeight: 48, alignSelf: "flex-start" }}
        >
          <i className="ph-duotone ph-arrow-right" style={{ fontSize: 18 }} />
          <span>Keep Going</span>
        </Link>
      ) : (
        allWorked && (
          <p style={{ fontSize: 14, color: "var(--neutral-700)", padding: "12px 0 0" }}>
            You&rsquo;ve worked your whole queue for today. Nice work.
          </p>
        )
      )}
    </>
  );
}
