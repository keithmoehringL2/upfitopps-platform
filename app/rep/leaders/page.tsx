import Link from "next/link";
import { requireRep } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { brandRampVars } from "@/lib/brand/ramp";

type Period = "today" | "week" | "month";
const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "Week to date" },
  { key: "month", label: "Month" },
];

export default async function RepLeadersPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: p } = await searchParams;
  const period: Period = (["today", "week", "month"] as const).includes(p as Period) ? (p as Period) : "week";

  const ctx = await requireRep();
  const [board, distributor] = await Promise.all([
    data.getLeaderboard(ctx, period),
    data.getDistributorById(ctx.distributorId!),
  ]);

  const repLabel = (email: string) => email.split("@")[0];

  return (
    <div
      style={{
        ...brandRampVars(distributor?.primaryColor),
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      <header style={{ padding: "max(16px, env(safe-area-inset-top)) 20px 8px", boxShadow: "0 1px 0 var(--divider)", position: "sticky", top: 0, background: "var(--bg)", zIndex: 2 }}>
        <Link href="/rep" className="btn btn-ghost" style={{ paddingLeft: 0, minHeight: 44, fontSize: 15 }}>
          <i className="ph-duotone ph-caret-left" />
          <span>Queue</span>
        </Link>
      </header>

      <div style={{ padding: "16px 20px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
        <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
          <i className="ph-duotone ph-trophy" style={{ fontSize: 26 }} />
          <span>Team Leaderboard</span>
        </h3>

        {board === null ? (
          <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>
            The leaderboard is turned off for your team.
          </p>
        ) : (
          <>
            <div style={{ display: "inline-flex", alignSelf: "flex-start", border: "1px solid var(--divider)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
              {PERIODS.map((pp) => (
                <Link
                  key={pp.key}
                  href={`/rep/leaders?period=${pp.key}`}
                  scroll={false}
                  style={{
                    padding: "9px 14px",
                    fontSize: 14,
                    textDecoration: "none",
                    color: period === pp.key ? "var(--bg)" : "var(--text)",
                    background: period === pp.key ? "var(--accent-500)" : "transparent",
                  }}
                >
                  {pp.label}
                </Link>
              ))}
            </div>

            <div>
              <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0,1fr) 44px 44px 36px 40px 48px", gap: 6, padding: "0 0 8px", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)", borderBottom: "1px solid var(--divider)" }}>
                <span></span><span>Rep</span>
                <span style={{ textAlign: "right" }}>Calls</span>
                <span style={{ textAlign: "right" }}>Goal</span>
                <span style={{ textAlign: "right" }}>DMs</span>
                <span style={{ textAlign: "right" }}>Opps</span>
                <span style={{ textAlign: "right" }}>Opp/DM</span>
              </div>
              {board.rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "18px minmax(0,1fr) 44px 44px 36px 40px 48px",
                    gap: 6,
                    padding: "13px 0",
                    fontSize: 15,
                    alignItems: "baseline",
                    fontWeight: r.isMe ? 600 : 400,
                    borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--accent-700)" }}>{r.rank}</span>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {repLabel(r.email)}{r.isMe ? " (you)" : ""}
                  </span>
                  <span style={{ textAlign: "right" }}>{r.calls}</span>
                  <span style={{ textAlign: "right" }}>{r.goalPct != null ? `${r.goalPct}%` : "—"}</span>
                  <span style={{ textAlign: "right" }}>{r.dm}</span>
                  <span style={{ textAlign: "right" }}>{r.opp}</span>
                  <span style={{ textAlign: "right" }}>{r.conv != null ? `${r.conv}%` : "—"}</span>
                </div>
              ))}
              {board.rows.length === 0 && (
                <p style={{ fontSize: 14, color: "var(--neutral-700)", paddingTop: 14 }}>No activity yet.</p>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "6px 12px", fontSize: 13, lineHeight: 1.4, color: "var(--neutral-800)" }}>
              <span style={{ fontWeight: 600 }}>Calls</span><span>Recorded cold outreach attempts</span>
              <span style={{ fontWeight: 600 }}>Goal</span><span>Percent of target reached</span>
              <span style={{ fontWeight: 600 }}>DMs</span><span>Decision-makers reached</span>
              <span style={{ fontWeight: 600 }}>Opps</span><span>Opportunities identified</span>
              <span style={{ fontWeight: 600 }}>Opp/DM</span><span>Opportunities ÷ decision-maker conversations</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
