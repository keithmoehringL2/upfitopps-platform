"use client";

import { useState } from "react";

export interface TrendPoint { week: string; attempts: number; rate: number }

// 12-week trend as a div-bar chart with a metric toggle. Two real metrics:
// cumulative market-outreach rate and weekly attempts (opportunities/quotes
// aren't timestamped as events yet, so they're KPI totals, not a series).
export function TrendChart({ series }: { series: TrendPoint[] }) {
  const [metric, setMetric] = useState<"rate" | "attempts">("rate");
  const vals = series.map((s) => (metric === "rate" ? s.rate : s.attempts));
  const max = metric === "rate" ? Math.max(50, ...vals) : Math.max(1, ...vals);
  const note =
    metric === "rate"
      ? "Cumulative share of VIO companies with at least one recorded attempt, by week."
      : "Recorded attempts on VIO companies each week.";
  const fmt = (v: number) => (metric === "rate" ? `${v}%` : String(v));

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
          <i className="ph-duotone ph-chart-line-up" /> Trend
        </h3>
        <div className="seg" style={{ alignSelf: "flex-start" }}>
          <label className="seg-opt" style={{ padding: "7px 14px", fontSize: 13 }}>
            <input type="radio" name="trend" checked={metric === "rate"} onChange={() => setMetric("rate")} /> Market outreach rate
          </label>
          <label className="seg-opt" style={{ padding: "7px 14px", fontSize: 13 }}>
            <input type="radio" name="trend" checked={metric === "attempts"} onChange={() => setMetric("attempts")} /> Weekly attempts
          </label>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${series.length}, 1fr)`, gap: 8, height: 200, alignItems: "end" }}>
        {series.map((s, i) => {
          const v = metric === "rate" ? s.rate : s.attempts;
          const h = Math.round((v / max) * 160);
          const last = i === series.length - 1;
          return (
            <div key={s.week} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
              <span style={{ fontSize: 11, color: "var(--neutral-700)" }}>{fmt(v)}</span>
              <div style={{ width: "70%", height: Math.max(2, h), background: last ? "var(--accent-500)" : "var(--accent-300)", borderRadius: "var(--radius-sm)" }} />
              <span style={{ fontSize: 10, color: "var(--neutral-600)", whiteSpace: "nowrap" }}>{s.week}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: "var(--neutral-700)", margin: 0 }}>{note}</p>
    </section>
  );
}
