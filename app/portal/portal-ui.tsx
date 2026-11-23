// Shared, aggregate-only presentational pieces for the manufacturer portal.

export interface Totals {
  N: number; A: number; E: number; pdm: number; dmr: number; opp: number; q: number; mor: number;
}

const pct = (num: number, den: number) => (den ? `${Math.round((num / den) * 100)}%` : "—");

export function Kpis({ totals }: { totals: Totals }) {
  const t = totals;
  const tiles = [
    { label: "VIO companies", value: String(t.N), accent: null as string | null, sub: "Addressable companies in the cohort" },
    { label: "Market outreach rate", value: pct(t.A, t.N), accent: null, sub: `${t.A} companies with a recorded attempt` },
    { label: "Recorded attempts", value: String(t.E), accent: null, sub: "Calls with a saved outcome" },
    { label: "DMs identified", value: String(t.pdm), accent: pct(t.pdm, t.N), sub: "Primary confirmed by a rep" },
    { label: "DMs reached", value: String(t.dmr), accent: pct(t.dmr, t.N), sub: "Spoke to the decision-maker" },
    { label: "Opportunities", value: String(t.opp), accent: pct(t.opp, t.N), sub: `${pct(t.opp, t.dmr)} of DMs reached` },
    { label: "Companies quoted", value: String(t.q), accent: pct(t.q, t.N), sub: "Quote conversion of the cohort" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 20 }}>
      {tiles.map((tile) => (
        <div key={tile.label} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{tile.label}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1 }}>{tile.value}</span>
            {tile.accent && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-700)" }}>{tile.accent}</span>}
          </div>
          <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{tile.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function PrivacyNote({ manufacturerName, regionalOnly }: { manufacturerName: string; regionalOnly: boolean }) {
  return (
    <p style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--neutral-700)", borderTop: "1px solid var(--divider)", paddingTop: 16, margin: 0 }}>
      <i className="ph-duotone ph-shield-check" style={{ color: "var(--accent-700)", flex: "none", marginTop: 1 }} />
      <span>
        These figures cover only companies {manufacturerName} supplied through its VIO program and outreach recorded against them.
        Distributor customer lists, unrelated leads, rep notes, contact details, quote amounts and revenue are never shown.
        {regionalOnly ? " You see only distributors assigned to you." : ""}
      </span>
    </p>
  );
}
