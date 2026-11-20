"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface ContactRow {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
  lifecycleState: string;
  suppressed: string | null;
}

const FIELD_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 5,
  color: "color-mix(in srgb, var(--text) 70%, transparent)",
};

function typeOf(c: ContactRow): string {
  if (c.lifecycleState === "customer") return "Past customer";
  if (c.lifecycleState === "opp") return "Opportunity";
  return "Cold prospect";
}

export function ContactsTable({ companies }: { companies: ContactRow[] }) {
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [industry, setIndustry] = useState("");
  const [type, setType] = useState(""); // "" | cold | customer
  const [priority, setPriority] = useState(""); // "" | hi | mid | lo

  const cities = useMemo(() => [...new Set(companies.map((c) => c.city).filter(Boolean))].sort() as string[], [companies]);
  const industries = useMemo(() => [...new Set(companies.map((c) => c.industryPrimary).filter(Boolean))].sort() as string[], [companies]);

  const rows = useMemo(() => {
    const pri = (c: ContactRow) => (c.priorityScore != null ? parseFloat(c.priorityScore) : -1);
    return companies
      .filter((c) => {
        if (city && c.city !== city) return false;
        if (zip && !(c.zip ?? "").startsWith(zip)) return false;
        if (industry && c.industryPrimary !== industry) return false;
        if (type === "cold" && c.lifecycleState !== "cold") return false;
        if (type === "customer" && c.lifecycleState !== "customer") return false;
        if (priority === "hi" && pri(c) < 4) return false;
        if (priority === "mid" && (pri(c) < 3 || pri(c) >= 4)) return false;
        if (priority === "lo" && pri(c) >= 3) return false;
        return true;
      })
      .sort((a, b) => pri(b) - pri(a));
  }, [companies, city, zip, industry, type, priority]);

  const hasFilters = !!(city || zip || industry || type || priority);
  const clear = () => {
    setCity(""); setZip(""); setIndustry(""); setType(""); setPriority("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 27, fontWeight: 600 }}>My Contacts</h2>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
          {rows.length} of {companies.length}
        </span>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="field">
            <label style={FIELD_LABEL}>City</label>
            <select className="input" value={city} onChange={(e) => setCity(e.target.value)} style={{ minHeight: 44, fontSize: 15 }}>
              <option value="">All cities</option>
              {cities.map((o) => (<option key={o} value={o}>{o}</option>))}
            </select>
          </div>
          <div className="field">
            <label style={FIELD_LABEL}>ZIP</label>
            <input className="input" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Any" style={{ minHeight: 44, fontSize: 15 }} />
          </div>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Industry</label>
          <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ minHeight: 44, fontSize: 15 }}>
            <option value="">All industries</option>
            {industries.map((o) => (<option key={o} value={o}>{o}</option>))}
          </select>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Type</label>
          <div className="seg" style={{ display: "flex" }}>
            {[["", "All"], ["cold", "Cold prospect"], ["customer", "Past customer"]].map(([v, label]) => (
              <label key={v} className="seg-opt" style={{ flex: 1, justifyContent: "center", padding: "12px 8px", fontSize: 14, minHeight: 44 }}>
                <input type="radio" name="ctype" checked={type === v} onChange={() => setType(v)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Priority</label>
          <div className="seg" style={{ display: "flex" }}>
            {[["", "Any"], ["hi", "4.0+"], ["mid", "3.0–3.9"], ["lo", "Under 3"]].map(([v, label]) => (
              <label key={v} className="seg-opt" style={{ flex: 1, justifyContent: "center", padding: "12px 8px", fontSize: 14, minHeight: 44 }}>
                <input type="radio" name="cpri" checked={priority === v} onChange={() => setPriority(v)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        {hasFilters && (
          <button type="button" onClick={clear} className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0, minHeight: 44 }}>
            <i className="ph-duotone ph-x" />
            <span>Clear filters</span>
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 44px", gap: 10, paddingBottom: 8, fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)", borderBottom: "1px solid var(--divider)" }}>
          <span>Company</span><span>ZIP</span><span style={{ textAlign: "right" }}>Priority</span>
        </div>
        {rows.map((c) => (
          <Link
            key={c.id}
            href={`/rep/company/${c.id}`}
            style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 54px 44px", gap: 10, alignItems: "baseline", padding: "12px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.25 }}>{c.name}</span>
              <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
                {[c.city, c.industryPrimary, typeOf(c)].filter(Boolean).join(" · ")}
              </span>
            </div>
            <span style={{ fontSize: 14 }}>{c.zip ?? "—"}</span>
            <span style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{c.priorityScore ?? "—"}</span>
          </Link>
        ))}
        {rows.length === 0 && (
          <span style={{ fontSize: 14, color: "var(--neutral-700)", paddingTop: 14 }}>No contacts match these filters.</span>
        )}
      </div>
    </div>
  );
}
