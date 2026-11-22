"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface DistributorRow {
  id: string;
  name: string;
  slug: string;
  primaryColor: string;
  status: "active" | "paused" | "disabled" | "onboarding";
  companyCount: number;
  repCount: number;
  managerName: string | null;
  programs: string[];
  lastImport: string | null;
}

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "upfitopps.com";

const STATUS: Record<DistributorRow["status"], { label: string; cls: string }> = {
  active: { label: "Active", cls: "tag-accent" },
  onboarding: { label: "Onboarding", cls: "tag-outline" },
  paused: { label: "Paused", cls: "tag-neutral" },
  disabled: { label: "Disabled", cls: "tag-outline" },
};

export function DistributorsTable({ rows }: { rows: DistributorRow[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((d) => `${d.name} ${d.slug}`.toLowerCase().includes(needle));
  }, [q, rows]);

  const active = rows.filter((d) => d.status === "active").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>
            {rows.length} account{rows.length === 1 ? "" : "s"} · {active} active
          </div>
          <h1 style={{ margin: "6px 0 0", fontSize: 34, fontWeight: 600 }}>Distributors</h1>
        </div>
        <Link href="/distributors/new" className="btn btn-primary" style={{ minHeight: 46 }}>
          <i className="ph-duotone ph-plus" />
          <span>New distributor</span>
        </Link>
      </div>

      <input
        className="input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search distributors or subdomains"
        style={{ maxWidth: 420, minHeight: 44 }}
      />

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 1040 }}>
          <thead>
            <tr>
              <th>Distributor</th>
              <th>Status</th>
              <th>Manager</th>
              <th style={{ textAlign: "right" }}>Reps</th>
              <th>Programs</th>
              <th style={{ textAlign: "right" }}>Companies</th>
              <th>Last import</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const st = STATUS[d.status] ?? STATUS.active;
              return (
                <tr key={d.id} style={{ cursor: "pointer" }}>
                  <td>
                    <Link href={`/distributors/${d.id}`} style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: "inherit" }}>
                      <span
                        aria-hidden
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 8,
                          background: d.primaryColor,
                          color: "#fff",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 15,
                          fontWeight: 600,
                          flex: "none",
                        }}
                      >
                        {d.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                        <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{d.slug}.{ROOT}</span>
                      </span>
                    </Link>
                  </td>
                  <td><span className={`tag ${st.cls}`}>{st.label}</span></td>
                  <td>{d.managerName ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{d.repCount}</td>
                  <td>{d.programs.length ? d.programs.join(", ") : "—"}</td>
                  <td style={{ textAlign: "right" }}>{d.companyCount.toLocaleString()}</td>
                  <td>{d.lastImport ?? "—"}</td>
                  <td>
                    <Link href={`/distributors/${d.id}`} aria-label={`Open ${d.name}`} style={{ color: "var(--neutral-600)" }}>
                      <i className="ph-duotone ph-caret-right" />
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ fontSize: 14, color: "var(--neutral-700)", padding: "20px 0" }}>
                  No distributors match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
