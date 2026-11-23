import Link from "next/link";
import { requireManufacturer, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { PortalShell } from "./portal-shell";
import { Kpis, PrivacyNote } from "./portal-ui";
import { TrendChart } from "./trend-chart";

const pctStr = (x: number) => `${Math.round(x * 100)}%`;

// Manufacturer portal Overview (screen 08). Aggregate-only, program-scoped.
export default async function PortalOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ rep?: string }>;
}) {
  const ctx = await requireManufacturer();
  const { rep } = await searchParams;
  const [ov, me] = await Promise.all([
    data.getManufacturerOverview(ctx, rep ?? null),
    getCurrentUser(),
  ]);

  const isLeader = ov.role === "mfr_leadership";
  const title = !isLeader
    ? "Your assigned distributors"
    : ov.activeRepFilter
      ? `${ov.regionalReps.find((r) => r.id === ov.activeRepFilter)?.name ?? "Rep"}'s distributors`
      : "All participating distributors";

  return (
    <PortalShell manufacturerName={ov.manufacturerName} scopeLabel={ov.scopeLabel} userName={me?.name ?? me?.email} userRole={ov.role}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--accent-700)" }}>
          {ov.manufacturerName} VIO program · program to date
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>{title}</h1>
          {isLeader && ov.regionalReps.length > 0 && (
            <div className="seg" style={{ alignSelf: "flex-end" }}>
              <Link href="/" className="seg-opt" style={{ padding: "8px 14px", fontSize: 13, textDecoration: "none", color: "inherit", background: !ov.activeRepFilter ? "var(--accent-100)" : "transparent", fontWeight: !ov.activeRepFilter ? 600 : 400 }}>All regions</Link>
              {ov.regionalReps.map((r) => (
                <Link key={r.id} href={`/?rep=${r.id}`} className="seg-opt" style={{ padding: "8px 14px", fontSize: 13, textDecoration: "none", color: "inherit", background: ov.activeRepFilter === r.id ? "var(--accent-100)" : "transparent", fontWeight: ov.activeRepFilter === r.id ? 600 : 400 }}>{r.name}</Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <Kpis totals={ov.totals} />

      <TrendChart series={ov.trend} />

      {isLeader && ov.byRep && ov.byRep.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
            <i className="ph-duotone ph-map-trifold" /> By regional rep
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 760 }}>
              <thead><tr><th>Regional rep</th><th style={{ textAlign: "right" }}>Distributors</th><th style={{ textAlign: "right" }}>VIO companies</th><th style={{ textAlign: "right" }}>Market outreach</th><th style={{ textAlign: "right" }}>DMs reached</th><th style={{ textAlign: "right" }}>Opportunities</th><th style={{ textAlign: "right" }}>Companies quoted</th></tr></thead>
              <tbody>
                {ov.byRep.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{r.repName}</td>
                    <td style={{ textAlign: "right" }}>{r.distributors}</td>
                    <td style={{ textAlign: "right" }}>{r.N}</td>
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
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
          <i className="ph-duotone ph-storefront" /> Distributors
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 1000 }}>
            <thead><tr><th>Distributor</th><th>Regional rep</th><th style={{ textAlign: "right" }}>VIO companies</th><th>Market outreach</th><th style={{ textAlign: "right" }}>Attempts</th><th style={{ textAlign: "right" }}>DMs identified</th><th style={{ textAlign: "right" }}>DMs reached</th><th style={{ textAlign: "right" }}>Opportunities</th><th style={{ textAlign: "right" }}>Quoted</th><th></th></tr></thead>
            <tbody>
              {ov.distributors.map((d) => (
                <tr key={d.id}>
                  <td style={{ fontWeight: 600 }}><Link href={`/distributor/${d.id}`} style={{ color: "var(--accent-700)", textDecoration: "none" }}>{d.name}</Link></td>
                  <td style={{ fontSize: 13, color: "var(--neutral-700)" }}>{d.regionalRepName ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>{d.N}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 60, height: 8, background: "var(--neutral-200)", borderRadius: 4 }}>
                        <div style={{ width: pctStr(d.mor), height: "100%", background: "var(--accent-500)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 13, width: 36, textAlign: "right" }}>{pctStr(d.mor)}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{d.E}</td>
                  <td style={{ textAlign: "right" }}>{d.pdm}</td>
                  <td style={{ textAlign: "right" }}>{d.dmr}</td>
                  <td style={{ textAlign: "right" }}>{d.opp}</td>
                  <td style={{ textAlign: "right" }}>{d.q}</td>
                  <td><Link href={`/distributor/${d.id}`} aria-label={`Open ${d.name}`} style={{ color: "var(--neutral-600)" }}><i className="ph-duotone ph-caret-right" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PrivacyNote manufacturerName={ov.manufacturerName} regionalOnly={!isLeader} />
    </PortalShell>
  );
}
