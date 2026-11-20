"use client";

import Link from "next/link";
import { useState } from "react";

export interface RepStat {
  id: string;
  email: string;
  goal: number;
  attempts: number;
  pdm: number;
  dm: number;
  opportunities: number;
  quoted: number;
}

const METRICS = [
  { key: "attempts", label: "Attempts" },
  { key: "pdm", label: "DMs identified" },
  { key: "dm", label: "DM conversations" },
  { key: "opportunities", label: "Opportunities" },
  { key: "quoted", label: "Quoted" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

// Switching the metric only re-reads data already loaded for every rep, so it's
// local state — the chart changes in place with no navigation or scroll jump.
export function ByRepChart({ perRep }: { perRep: RepStat[] }) {
  const [metric, setMetric] = useState<MetricKey>("attempts");
  const metricVal = (r: RepStat) => r[metric];
  const maxBar = Math.max(
    1,
    ...perRep.map((r) => (metric === "attempts" ? Math.max(r.attempts, r.goal) : metricVal(r))),
  );
  const chartNote =
    metric === "attempts"
      ? "Black tick marks each active rep's target for the period. Click a rep to see their companies."
      : "Unique companies. Click a rep to see their companies.";

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
          <i className="ph-duotone ph-chart-bar-horizontal" style={{ fontSize: 26 }} />
          <span>By rep</span>
        </h3>
        <div style={{ display: "inline-flex", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", overflow: "hidden", flexWrap: "wrap" }}>
          {METRICS.map((m) => {
            const active = metric === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                style={{
                  padding: "9px 15px",
                  fontSize: 14,
                  fontFamily: "inherit",
                  border: "none",
                  cursor: "pointer",
                  color: active ? "var(--bg)" : "var(--text)",
                  background: active ? "var(--accent-500)" : "transparent",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {perRep.map((r) => (
          <Link
            key={r.id}
            href={`/manager/companies?owner=${r.id}`}
            style={{ display: "grid", gridTemplateColumns: "190px minmax(0,1fr) 60px", gap: 18, alignItems: "center", textDecoration: "none", color: "inherit" }}
          >
            <span style={{ fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.email}</span>
            <div style={{ position: "relative", height: 28, background: "var(--neutral-100)", borderRadius: "var(--radius-md)" }}>
              <div style={{ height: "100%", width: `${(metricVal(r) / maxBar) * 100}%`, background: "var(--accent-500)", borderRadius: "var(--radius-md)", transition: "width .3s" }} />
              {metric === "attempts" && r.goal > 0 && (
                <div style={{ position: "absolute", top: -5, bottom: -5, left: `calc(${(r.goal / maxBar) * 100}% - 1px)`, width: 2, background: "var(--text)" }} />
              )}
            </div>
            <span style={{ textAlign: "right", fontSize: 18, fontWeight: 600 }}>{metricVal(r)}</span>
          </Link>
        ))}
        {perRep.length === 0 && <span style={{ fontSize: 14, color: "var(--neutral-700)" }}>No reps yet.</span>}
      </div>
      <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{chartNote}</span>
    </section>
  );
}
