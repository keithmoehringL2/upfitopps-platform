import Link from "next/link";

// Follow-up Reminders, matching the design handoff's Rep Queue section:
// explicit follow-ups due today/overdue plus customer touch-base reminders,
// an "Nothing due today." empty state, and a dated Upcoming sub-list. These
// never count toward the daily goal.

interface Reminder {
  id: string;
  name: string;
  city: string | null;
  industryPrimary: string | null;
  priorityScore: string | null;
  lastTouchDate: string | null;
  dueDate: string;
  note: string | null;
  kind: "follow_up" | "touch_base";
}

const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

function dueLabel(dueDate: string, today: string): string {
  if (dueDate >= today) return "Due today";
  const days = Math.round(
    (new Date(today + "T00:00:00").getTime() - new Date(dueDate + "T00:00:00").getTime()) /
      86_400_000,
  );
  return `${days} day${days === 1 ? "" : "s"} overdue`;
}

export function FollowUps({ due, upcoming }: { due: Reminder[]; upcoming: Reminder[] }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section id="followups" style={{ display: "flex", flexDirection: "column", gap: 10, scrollMarginTop: 120 }}>
      <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
        <i className="ph-duotone ph-bell-ringing" style={{ fontSize: 26 }} />
        <span>Follow-ups</span>
      </h3>

      {due.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "2px 0 0" }}>Nothing due today.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {due.map((r) => (
            <Link
              key={r.id}
              href={`/rep/company/${r.id}`}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                padding: "12px 0",
                textDecoration: "none",
                color: "inherit",
                borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25, minWidth: 0 }}>{r.name}</span>
                <span style={{ flex: "none", fontSize: 12, fontWeight: 600, color: r.dueDate < today ? "var(--accent-700)" : "var(--neutral-800)" }}>
                  {dueLabel(r.dueDate, today)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
                  {[r.city, r.kind === "touch_base" ? "Customer" : r.industryPrimary].filter(Boolean).join(" · ")}
                </span>
                {r.lastTouchDate && (
                  <span className="tag" style={{ fontSize: 11 }}>Last: {fmt(r.lastTouchDate)}</span>
                )}
              </div>
              {r.note && (
                <span style={{ fontSize: 13, fontStyle: "italic", color: "var(--neutral-700)" }}>{r.note}</span>
              )}
            </Link>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-800)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Upcoming
          </span>
          {upcoming.map((r) => (
            <Link
              key={r.id}
              href={`/rep/company/${r.id}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                padding: "9px 0",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <span style={{ fontSize: 15, minWidth: 0 }}>{r.name}</span>
              <span style={{ flex: "none", fontSize: 13, color: "var(--neutral-700)" }}>{fmt(r.dueDate)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
