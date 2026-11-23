import Link from "next/link";
import { notFound } from "next/navigation";
import { requireManufacturer, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { PortalShell } from "../../portal-shell";
import { Kpis } from "../../portal-ui";
import { TrendChart } from "../../trend-chart";

const pctStr = (x: number) => `${Math.round(x * 100)}%`;

// Manufacturer portal distributor drill-in (screen 09). Aggregate-only.
export default async function PortalDistributorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireManufacturer();
  const dd = await data.getManufacturerDistributor(ctx, id).catch(() => null);
  if (!dd) notFound();
  const me = await getCurrentUser();

  return (
    <PortalShell manufacturerName={dd.manufacturerName} userName={me?.name ?? me?.email} userRole={ctx.role}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
          <i className="ph-duotone ph-caret-left" /><span>All distributors</span>
        </Link>
        <div style={{ fontSize: 13, color: "var(--neutral-700)" }}>
          {dd.regionalRepName ? `Regional rep ${dd.regionalRepName}` : "No regional rep"}
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>{dd.distributorName}</h1>
        <div style={{ fontSize: 13, color: "var(--accent-700)" }}>
          {dd.manufacturerName} VIO program{dd.cohort ? ` · ${dd.cohort}` : ""} · active {dd.weeksActive} week{dd.weeksActive === 1 ? "" : "s"}
        </div>
      </div>

      <Kpis totals={dd.totals} />

      {/* Cohort progress funnel */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
          <i className="ph-duotone ph-funnel" /> Cohort progress
        </h3>
        {dd.funnel.map((f) => (
          <div key={f.label} style={{ display: "grid", gridTemplateColumns: "180px 1fr 120px", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 14 }}>{f.label}</span>
            <div style={{ height: 12, background: "var(--neutral-200)", borderRadius: 6 }}>
              <div style={{ width: `${f.pct}%`, height: "100%", background: "var(--accent-500)", borderRadius: 6 }} />
            </div>
            <span style={{ fontSize: 13, textAlign: "right" }}>{f.value} · {f.pct}%</span>
          </div>
        ))}
        <p style={{ fontSize: 12, color: "var(--neutral-700)", margin: 0 }}>
          Unique VIO companies at each stage, as a share of the cohort. Removed and do-not-contact companies stay in the cohort.
        </p>
      </section>

      <TrendChart series={dd.trend} />

      {/* By industry */}
      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
          <i className="ph-duotone ph-briefcase" /> By industry
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead><tr><th>Industry</th><th style={{ textAlign: "right" }}>VIO companies</th><th style={{ textAlign: "right" }}>Avg. fleet</th><th style={{ textAlign: "right" }}>Market outreach</th><th style={{ textAlign: "right" }}>DMs reached</th><th style={{ textAlign: "right" }}>Opportunities</th><th style={{ textAlign: "right" }}>Quoted</th></tr></thead>
            <tbody>
              {dd.byIndustry.map((r) => (
                <tr key={r.industry}>
                  <td style={{ fontWeight: 600 }}>{r.industry}</td>
                  <td style={{ textAlign: "right" }}>{r.N}</td>
                  <td style={{ textAlign: "right" }}>{r.avgFleet || "—"}</td>
                  <td style={{ textAlign: "right" }}>{pctStr(r.mor)}</td>
                  <td style={{ textAlign: "right" }}>{r.dmr}</td>
                  <td style={{ textAlign: "right" }}>{r.opp}</td>
                  <td style={{ textAlign: "right" }}>{r.q}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Included / Never shared */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40, borderTop: "1px solid var(--divider)", paddingTop: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><i className="ph-duotone ph-check-circle" style={{ color: "var(--accent-700)" }} /> Included in this report</h4>
          <p style={{ fontSize: 13, color: "var(--neutral-700)", margin: 0 }}>
            Companies supplied in the {dd.manufacturerName} VIO cohort, and outreach, decision-maker, opportunity and quote counts recorded against them under this program.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><i className="ph-duotone ph-eye-slash" style={{ color: "var(--neutral-700)" }} /> Never shared</h4>
          <p style={{ fontSize: 13, color: "var(--neutral-700)", margin: 0 }}>
            The distributor&rsquo;s own customers and other leads, contact names, rep notes, individual rep performance, quote amounts, revenue and margins. A quote recorded here does not mean {dd.manufacturerName} product was sold.
          </p>
        </div>
      </div>
    </PortalShell>
  );
}
