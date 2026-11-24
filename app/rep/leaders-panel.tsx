"use client";

import { useState, useTransition } from "react";
import { getLeaderboardAction } from "@/lib/rep/actions";

type Period = "today" | "week" | "month";
export type Board = Awaited<ReturnType<typeof getLeaderboardAction>>;

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week to date" },
  { key: "month", label: "Month" },
];

const repLabel = (email: string) => email.split("@")[0];
const GRID = "18px minmax(0,1fr) 44px 44px 36px 40px 48px";

// The team leaderboard, rendered inside a home panel. Period changes re-fetch
// through a server action (the gateway enforces the leaderboard on/off switch).
export function LeadersPanel({ initialBoard }: { initialBoard: Board }) {
  const [board, setBoard] = useState<Board>(initialBoard);
  const [period, setPeriod] = useState<Period>("week");
  const [pending, start] = useTransition();

  function pick(p: Period) {
    if (p === period) return;
    setPeriod(p);
    start(async () => setBoard(await getLeaderboardAction(p)));
  }

  if (board === null) {
    return <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>The leaderboard is turned off for your team.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: pending ? 0.6 : 1 }}>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
        {PERIODS.map((pp) => (
          <button
            key={pp.key}
            type="button"
            onClick={() => pick(pp.key)}
            style={{
              padding: "9px 14px",
              fontSize: 14,
              border: "none",
              cursor: "pointer",
              color: period === pp.key ? "var(--bg)" : "var(--text)",
              background: period === pp.key ? "var(--accent-500)" : "transparent",
            }}
          >
            {pp.label}
          </button>
        ))}
      </div>

      <div>
        <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, padding: "0 0 8px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)", borderBottom: "1px solid var(--divider)" }}>
          <span></span><span>Rep</span>
          <span style={{ textAlign: "right" }}>Calls</span>
          <span style={{ textAlign: "right" }}>Goal</span>
          <span style={{ textAlign: "right" }}>DMs</span>
          <span style={{ textAlign: "right" }}>Opps</span>
          <span style={{ textAlign: "right" }}>Opp/DM</span>
        </div>
        {board.rows.map((r) => (
          <div
            key={r.id}
            style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, padding: "13px 0", fontSize: 15, alignItems: "baseline", fontWeight: r.isMe ? 600 : 400, borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}
          >
            <span style={{ fontWeight: 600, color: "var(--accent-700)" }}>{r.rank}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {repLabel(r.email)}{r.isMe ? " (you)" : ""}
            </span>
            <span style={{ textAlign: "right" }}>{r.calls}</span>
            <span style={{ textAlign: "right" }}>{r.goalPct != null ? `${r.goalPct}%` : "—"}</span>
            <span style={{ textAlign: "right" }}>{r.dm}</span>
            <span style={{ textAlign: "right" }}>{r.opp}</span>
            <span style={{ textAlign: "right" }}>{r.conv != null ? `${r.conv}%` : "—"}</span>
          </div>
        ))}
        {board.rows.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--neutral-700)", paddingTop: 14 }}>No activity yet.</p>
        )}
      </div>
    </div>
  );
}
