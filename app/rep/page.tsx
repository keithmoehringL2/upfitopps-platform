import Link from "next/link";
import { requireRep, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { repLogout } from "@/lib/rep/actions";

// Rep work queue (mobile-first). Prospects the rep owns, due ones first. Tapping
// a card opens the company to log an outcome.
export default async function RepQueuePage() {
  const ctx = await requireRep();
  const [queue, progress, distributor, user] = await Promise.all([
    data.listRepQueue(ctx),
    data.getRepDayProgress(ctx),
    data.getDistributorById(ctx.distributorId!),
    getCurrentUser(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const isDue = (next: string | null) => !next || next <= today;
  const dueCount = queue.filter((c) => isDue(c.nextEligibleDate)).length;

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 48px", minHeight: "100dvh" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--neutral-600)" }}>
            {distributor?.name ?? "Your queue"}
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: "2px 0 0", color: "var(--accent-700)" }}>
            My queue
          </h1>
        </div>
        <form action={repLogout}>
          <button
            type="submit"
            style={{
              fontFamily: "inherit",
              fontSize: 13,
              color: "var(--neutral-700)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Sign out
          </button>
        </form>
      </header>

      <div
        style={{
          display: "flex",
          gap: 12,
          marginTop: 16,
          padding: "14px 16px",
          background: "var(--neutral-100)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <Stat label="Logged today" value={String(progress.worked)} sub={progress.target ? `of ${progress.target} goal` : undefined} />
        <div style={{ width: 1, background: "var(--divider)" }} />
        <Stat label="Due now" value={String(dueCount)} sub={`of ${queue.length} owned`} />
      </div>

      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)", margin: "24px 0 10px" }}>
        {queue.length} prospect{queue.length === 1 ? "" : "s"}
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {queue.map((c) => {
          const due = isDue(c.nextEligibleDate);
          return (
            <li key={c.id}>
              <Link
                href={`/rep/company/${c.id}`}
                style={{
                  display: "block",
                  padding: "14px 16px",
                  background: "#fff",
                  border: "1px solid var(--divider)",
                  borderLeft: `3px solid ${due ? "var(--accent-500)" : "var(--neutral-300)"}`,
                  borderRadius: "var(--radius-lg)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 17, fontWeight: 600 }}>{c.name}</span>
                  {c.priorityScore != null && (
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-700)" }}>★ {c.priorityScore}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: "var(--neutral-600)", marginTop: 2 }}>
                  {[c.city, c.industryPrimary].filter(Boolean).join(" · ")}
                </div>
                <div style={{ fontSize: 12, color: due ? "var(--accent-700)" : "var(--neutral-600)", marginTop: 6, fontWeight: due ? 600 : 400 }}>
                  {due
                    ? c.lastTouchDate
                      ? "Due now · last touched " + c.lastTouchDate
                      : "Never contacted"
                    : "Next eligible " + c.nextEligibleDate}
                </div>
              </Link>
            </li>
          );
        })}
        {queue.length === 0 && (
          <li style={{ fontSize: 14, color: "var(--neutral-600)", padding: "20px 0" }}>
            Your queue is empty. Nice work — check back after new prospects are assigned.
          </li>
        )}
      </ul>

      <p style={{ fontSize: 12, color: "var(--neutral-600)", marginTop: 28 }}>
        Signed in as {user?.email}
      </p>
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--neutral-600)" }}>{sub}</div>}
    </div>
  );
}
