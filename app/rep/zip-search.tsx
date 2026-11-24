"use client";

import { useState, useTransition } from "react";
import { searchZipAction, type ZipRow } from "@/lib/rep/actions";
import { ZipMap, directionsUrl } from "./zip-map";

export function ZipSearch({ apiKey }: { apiKey?: string }) {
  const [zip, setZip] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ zip: string; rows: ZipRow[] } | null>(null);
  const [error, setError] = useState("");

  function search() {
    const z = zip.replace(/\D/g, "").slice(0, 5);
    if (z.length !== 5) {
      setError("Enter all five digits.");
      return;
    }
    setError("");
    start(async () => {
      const res = await searchZipAction(z);
      if (!res.ok) {
        setError(res.error);
        setResult(null);
      } else {
        setResult({ zip: res.zip, rows: res.results });
      }
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
          onKeyDown={(e) => e.key === "Enter" && search()}
          inputMode="numeric"
          maxLength={5}
          placeholder="Five-digit ZIP, e.g. 78702"
          style={{ minHeight: 48, fontSize: 17, letterSpacing: "0.06em" }}
        />
        <button type="button" onClick={search} disabled={pending} className="btn btn-primary" style={{ minHeight: 48, padding: "0 20px" }}>
          {pending ? "…" : "Search"}
        </button>
      </div>

      <p style={{ fontSize: 13, color: "var(--neutral-700)", margin: 0 }}>
        {error
          ? error
          : "Shows prospects in exactly this ZIP, by priority. Searching never changes ownership."}
      </p>

      {/* Map + results appear only after a search */}
      {result && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
          <div style={{ fontSize: 14, color: "var(--neutral-800)", fontWeight: 600 }}>
            {result.rows.length > 0
              ? `${result.rows.length} prospect${result.rows.length === 1 ? "" : "s"} in ${result.zip}`
              : `No prospects in ${result.zip}.`}
          </div>

          {result.rows.length > 0 && <ZipMap pins={result.rows} apiKey={apiKey} />}

          {result.rows.map((r) => (
            <div key={r.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <a href={`/rep/company/${r.id}`} style={{ fontSize: 15, fontWeight: 600, color: "var(--accent-700)", textDecoration: "none" }}>{r.name}</a>
                <span style={{ fontSize: 13, color: "var(--neutral-800)" }}>{[r.address, r.phone].filter(Boolean).join(" · ")}</span>
                <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>
                  Owner: {r.ownerEmail ?? "Unassigned"}{r.lastTouchDate ? ` · Last: ${r.lastTouchDate}` : " · Never contacted"}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{r.priorityScore ?? "—"}</span>
                <a href={directionsUrl(r)} target="_blank" rel="noopener" className="btn btn-secondary" style={{ minHeight: 34, fontSize: 13, padding: "4px 10px" }}>
                  <i className="ph-duotone ph-navigation-arrow" />
                  <span>Route</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
