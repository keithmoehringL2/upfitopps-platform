"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignCompaniesAction } from "@/lib/manager/actions";

export interface CompanyRow {
  id: string;
  name: string;
  city: string | null;
  zip: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
  ownerUserId: string | null;
  lifecycleState: string;
  suppressed: string | null;
  lastTouchDate: string | null;
}
export interface RepOption {
  id: string;
  email: string;
}

function statusTag(row: CompanyRow): { label: string; cls: string } {
  if (row.suppressed) {
    return { label: row.suppressed === "dnc" ? "Do not contact" : "Removed", cls: "tag-accent-2" };
  }
  if (row.lifecycleState === "opp") return { label: "Opportunity", cls: "tag-accent-2" };
  if (row.lifecycleState === "customer") return { label: "Customer", cls: "tag-neutral" };
  return { label: "Cold prospect", cls: "tag-accent" };
}

const FIELD_LABEL: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  marginBottom: 5,
  color: "color-mix(in srgb, var(--text) 70%, transparent)",
};

export function CompaniesTable({
  companies,
  reps,
  initialOwner,
}: {
  companies: CompanyRow[];
  reps: RepOption[];
  initialOwner?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignTo, setAssignTo] = useState<string>(reps[0]?.id ?? "");
  const [error, setError] = useState<string>("");

  // Filters
  const [q, setQ] = useState("");
  const [zip, setZip] = useState("");
  const [owner, setOwner] = useState(initialOwner ?? ""); // "" | "none" | repId
  const [status, setStatus] = useState(""); // "" | cold | customer | opp | removed | dnc
  const [industry, setIndustry] = useState("");
  const [priority, setPriority] = useState(""); // "" | hi | mid | lo
  const [sort, setSort] = useState("pri"); // pri | name | last | zip

  const repEmail = useMemo(() => new Map(reps.map((r) => [r.id, r.email])), [reps]);
  const industries = useMemo(
    () => [...new Set(companies.map((c) => c.industryPrimary).filter(Boolean))].sort() as string[],
    [companies],
  );
  const unassignedCount = companies.filter((c) => !c.ownerUserId).length;

  const rows = useMemo(() => {
    const pri = (c: CompanyRow) => (c.priorityScore != null ? parseFloat(c.priorityScore) : -1);
    let out = companies.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (zip && !(c.zip ?? "").startsWith(zip)) return false;
      if (owner === "none" && c.ownerUserId) return false;
      if (owner && owner !== "none" && c.ownerUserId !== owner) return false;
      if (status) {
        if (status === "removed" && c.suppressed !== "remove") return false;
        if (status === "dnc" && c.suppressed !== "dnc") return false;
        if (["cold", "customer", "opp"].includes(status) && (c.suppressed || c.lifecycleState !== status)) return false;
      }
      if (industry && c.industryPrimary !== industry) return false;
      if (priority === "hi" && pri(c) < 4) return false;
      if (priority === "mid" && (pri(c) < 3 || pri(c) >= 4)) return false;
      if (priority === "lo" && pri(c) >= 3) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "zip") return (a.zip ?? "").localeCompare(b.zip ?? "");
      if (sort === "last") return (b.lastTouchDate ?? "").localeCompare(a.lastTouchDate ?? "");
      return pri(b) - pri(a);
    });
    return out;
  }, [companies, q, zip, owner, status, industry, priority, sort]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const allShownSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allShownSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });

  const hasFilters = !!(q || zip || owner || status || industry || priority);
  const clearFilters = () => {
    setQ(""); setZip(""); setOwner(""); setStatus(""); setIndustry(""); setPriority("");
  };

  function apply(ownerUserId: string | null) {
    setError("");
    const ids = [...selected];
    if (ids.length === 0) return;
    const fd = new FormData();
    fd.set("companyIds", ids.join(","));
    fd.set("ownerUserId", ownerUserId ?? "__unassign__");
    startTransition(async () => {
      const res = await assignCompaniesAction(undefined, fd);
      if (res.error) setError(res.error);
      else {
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--neutral-700)" }}>{companies.length} companies</div>
          <h1 style={{ margin: "2px 0 0", fontSize: 34, fontWeight: 600 }}>Companies</h1>
        </div>
        <button
          type="button"
          onClick={() => setOwner((v) => (v === "none" ? "" : "none"))}
          className={`btn ${owner === "none" ? "btn-primary" : "btn-secondary"}`}
          style={{ minHeight: 44 }}
        >
          <i className="ph-duotone ph-user-circle-dashed" />
          <span>{unassignedCount} unassigned</span>
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        <div className="field" style={{ gridColumn: "span 2" }}>
          <label style={FIELD_LABEL}>Search</label>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name" style={{ minHeight: 44 }} />
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>ZIP</label>
          <input className="input" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="Any" style={{ minHeight: 44 }} />
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Owner</label>
          <select className="input" value={owner} onChange={(e) => setOwner(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Anyone</option>
            <option value="none">Unassigned</option>
            {reps.map((r) => (
              <option key={r.id} value={r.id}>{r.email}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Any status</option>
            <option value="cold">Cold prospect</option>
            <option value="customer">Existing customer</option>
            <option value="opp">Opportunity</option>
            <option value="removed">Removed from outreach</option>
            <option value="dnc">Do not contact</option>
          </select>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Industry</label>
          <select className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Any industry</option>
            {industries.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)} style={{ minHeight: 44 }}>
            <option value="">Any</option>
            <option value="hi">4.0 and up</option>
            <option value="mid">3.0–3.9</option>
            <option value="lo">Under 3.0</option>
          </select>
        </div>
        <div className="field">
          <label style={FIELD_LABEL}>Sort by</label>
          <select className="input" value={sort} onChange={(e) => setSort(e.target.value)} style={{ minHeight: 44 }}>
            <option value="pri">Priority</option>
            <option value="name">Company name</option>
            <option value="last">Last outreach</option>
            <option value="zip">ZIP</option>
          </select>
        </div>
      </div>

      {/* Bulk action bar — only boxed once a selection exists. */}
      <div
        style={{
          position: selected.size ? "sticky" : "static",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
          minHeight: selected.size ? 60 : undefined,
          padding: selected.size ? "10px 16px" : 0,
          borderRadius: selected.size ? "var(--radius-md)" : 0,
          background: selected.size ? "var(--accent-100)" : "transparent",
        }}
      >
        {selected.size > 0 ? (
          <>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{selected.size} selected</span>
            <span style={{ fontSize: 14 }}>Assign to</span>
            <select className="input" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={{ width: 220, minHeight: 40, background: "var(--bg)" }}>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>{r.email}</option>
              ))}
            </select>
            <button type="button" disabled={pending || !assignTo} onClick={() => apply(assignTo)} className="btn btn-primary" style={{ minHeight: 40 }}>
              {pending ? "Saving…" : "Assign"}
            </button>
            <button type="button" disabled={pending} onClick={() => apply(null)} className="btn btn-secondary" style={{ minHeight: 40, background: "var(--bg)" }}>
              Unassign
            </button>
            <button type="button" onClick={() => setSelected(new Set())} className="btn btn-ghost" style={{ marginLeft: "auto" }}>
              Clear selection
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 14, color: "var(--neutral-800)" }}>
              {hasFilters ? `${rows.length} companies match.` : "Select companies to assign them to a rep’s queue."}
            </span>
            {rows.length > 0 && (
              <button type="button" onClick={toggleAll} className="btn btn-ghost">Select all {rows.length}</button>
            )}
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="btn btn-ghost" style={{ marginLeft: "auto" }}>
                <i className="ph-duotone ph-x" />
                <span>Clear filters</span>
              </button>
            )}
          </>
        )}
      </div>

      {error && <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{error}</p>}

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 15, minWidth: 1000 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allShownSelected} onChange={toggleAll} style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
              </th>
              <th>Company</th>
              <th style={{ textAlign: "right" }}>Priority</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Industry</th>
              <th>ZIP</th>
              <th>Last outreach</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = statusTag(r);
              const sel = selected.has(r.id);
              return (
                <tr key={r.id} style={{ background: sel ? "var(--accent-100)" : "transparent" }}>
                  <td>
                    <input type="checkbox" checked={sel} onChange={() => toggle(r.id)} style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontWeight: 600, color: "var(--accent-700)" }}>{r.name}</span>
                      <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{r.city}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{r.priorityScore ?? "—"}</td>
                  <td style={{ color: r.ownerUserId ? "var(--text)" : "var(--neutral-600)" }}>
                    {r.ownerUserId ? repEmail.get(r.ownerUserId) ?? "Assigned" : "Unassigned"}
                  </td>
                  <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                  <td>{r.industryPrimary ?? "—"}</td>
                  <td>{r.zip ?? "—"}</td>
                  <td style={{ fontSize: 14, color: "var(--neutral-800)" }}>{r.lastTouchDate ?? "No outreach"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p style={{ padding: "28px 0", color: "var(--neutral-700)" }}>No companies match these filters.</p>
        )}
      </div>
    </div>
  );
}
