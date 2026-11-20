import Link from "next/link";
import { requireRole, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { ManagerShell } from "./manager-shell";
import { ByRepChart } from "./by-rep-chart";

type Period = "today" | "week" | "month";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week to date" },
  { key: "month", label: "Month" },
];

export default async function ManagerOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period: Period = (["today", "week", "month"] as const).includes(sp.period as Period)
    ? (sp.period as Period)
    : "week";

  const ctx = await requireRole("manager");
  const [ov, distributor, user] = await Promise.all([
    data.getManagerOverview(ctx, period),
    data.getDistributorById(ctx.distributorId!),
    getCurrentUser(),
  ]);

  const pool = ov.funnel.poolTotal || 1;
  const funnel = [
    { label: "Total cold prospects", n: ov.funnel.poolTotal, sub: `${ov.funnel.assigned} assigned · ${ov.funnel.unassigned} unassigned` },
    { label: "Outreach attempted", n: ov.funnel.attempted, sub: "At least one recorded attempt" },
    { label: "Contacted", n: ov.funnel.contacted, sub: "Spoke with a gatekeeper or decision-maker" },
    { label: "Decision-makers identified", n: ov.funnel.decisionMakers, sub: "Primary confirmed by a rep" },
    { label: "Opportunities", n: ov.funnel.opportunities, sub: ov.funnel.contacted ? `${Math.round((ov.funnel.opportunities / ov.funnel.contacted) * 100)}% of contacted` : "None yet" },
  ];

  const totals = [
    { label: "Recorded attempts", value: ov.team.attempts, sub: ov.team.attainment != null ? `${ov.team.attainment}% of team target` : "—" },
    { label: "Decision-makers identified", value: ov.team.pdm, sub: "Confirmed by a rep" },
    { label: "DM conversations", value: ov.team.dm, sub: "Spoke to Decision-Maker" },
    { label: "Opportunities", value: ov.team.opportunities, sub: ov.team.oppYield != null ? `Yield ${ov.team.oppYield}%` : "—" },
    { label: "Companies quoted", value: ov.team.quoted, sub: "At least one quote recorded" },
  ];

  const H3: React.CSSProperties = { margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 };
  const seg = (active: boolean): React.CSSProperties => ({
    padding: "9px 15px",
    fontSize: 14,
    textDecoration: "none",
    color: active ? "var(--bg)" : "var(--text)",
    background: active ? "var(--accent-500)" : "transparent",
  });

  return (
    <ManagerShell
      brandName={distributor?.name ?? "Distributor"}
      primaryColor={distributor?.primaryColor}
      userEmail={user?.email}
      active="overview"
    >
      {/* Lead breakdown */}
      <section style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <h3 style={H3}><i className="ph-duotone ph-funnel" style={{ fontSize: 26 }} /><span>Lead breakdown</span></h3>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>All cold prospects to date · share of total</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 28 }}>
          {funnel.map((l) => {
            const pct = Math.round((l.n / pool) * 100);
            return (
              <div key={l.label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{l.label}</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>{l.n}</span>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "var(--accent-700)" }}>{pct}%</span>
                </div>
                <div style={{ height: 8, background: "var(--neutral-100)", borderRadius: "var(--radius-md)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent-500)", borderRadius: "var(--radius-md)" }} />
                </div>
                <span style={{ fontSize: 13, color: "var(--neutral-800)" }}>{l.sub}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Team performance */}
      <section style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <h3 style={H3}><i className="ph-duotone ph-chart-line-up" style={{ fontSize: 26 }} /><span>Team performance</span></h3>
          <div style={{ display: "inline-flex", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            {PERIODS.map((p) => (
              <Link key={p.key} href={`/manager?period=${p.key}`} scroll={false} style={seg(period === p.key)}>{p.label}</Link>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "32px" }}>
          {totals.map((t) => (
            <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{t.label}</span>
              <span style={{ fontSize: 44, fontWeight: 600, lineHeight: 1, letterSpacing: "-0.02em" }}>{t.value}</span>
              <span style={{ fontSize: 14, color: "var(--neutral-800)" }}>{t.sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* By rep (client — switches metric in place, no navigation) */}
      <ByRepChart perRep={ov.perRep} />

      {/* Rep performance table */}
      <section style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
        <h3 style={H3}><i className="ph-duotone ph-users-three" style={{ fontSize: 26 }} /><span>Rep performance</span></h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 15, minWidth: 980 }}>
            <thead>
              <tr>
                <th>Rep</th>
                <th style={{ textAlign: "right" }}>Daily target</th>
                <th style={{ textAlign: "right" }}>Attempts</th>
                <th style={{ textAlign: "right" }}>Target attainment</th>
                <th style={{ textAlign: "right" }}>DMs identified</th>
                <th style={{ textAlign: "right" }}>DM conversations</th>
                <th style={{ textAlign: "right" }}>Opportunities</th>
                <th style={{ textAlign: "right" }}>Companies quoted</th>
                <th style={{ textAlign: "right" }}>Opp yield</th>
              </tr>
            </thead>
            <tbody>
              {ov.perRep.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link href={`/manager/companies?owner=${r.id}`} style={{ color: "var(--accent-700)", textDecoration: "none" }}>{r.email}</Link>
                  </td>
                  <td style={{ textAlign: "right" }}>{r.target || "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.attempts}</td>
                  <td style={{ textAlign: "right" }}>{r.attainment != null ? `${r.attainment}%` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{r.pdm}</td>
                  <td style={{ textAlign: "right" }}>{r.dm}</td>
                  <td style={{ textAlign: "right" }}>{r.opportunities}</td>
                  <td style={{ textAlign: "right" }}>{r.quoted}</td>
                  <td style={{ textAlign: "right" }}>{r.oppYield != null ? `${r.oppYield}%` : "—"}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600 }}>
                <td>Team</td>
                <td style={{ textAlign: "right" }}>{ov.team.target || "—"}</td>
                <td style={{ textAlign: "right" }}>{ov.team.attempts}</td>
                <td style={{ textAlign: "right" }}>{ov.team.attainment != null ? `${ov.team.attainment}%` : "—"}</td>
                <td style={{ textAlign: "right" }}>{ov.team.pdm}</td>
                <td style={{ textAlign: "right" }}>{ov.team.dm}</td>
                <td style={{ textAlign: "right" }}>{ov.team.opportunities}</td>
                <td style={{ textAlign: "right" }}>{ov.team.quoted}</td>
                <td style={{ textAlign: "right" }}>{ov.team.oppYield != null ? `${ov.team.oppYield}%` : "—"}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
          Counts are unique companies except Attempts. Target attainment = recorded cold attempts ÷ (daily
          target × working days). Opp yield = opportunities ÷ decision-maker conversations. Activity reflects
          what reps recorded. Click a rep to see their companies.
        </span>
      </section>
    </ManagerShell>
  );
}
