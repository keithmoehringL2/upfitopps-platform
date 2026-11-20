import Link from "next/link";
import { requireRep, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { repLogout } from "@/lib/rep/actions";
import { brandRampVars } from "@/lib/brand/ramp";
import { ZipSearch } from "./zip-search";

// Rep work queue, rebuilt to the design handoff's Rep Mobile prototype:
// branded sticky header + icon nav, the attempts/target hero with a segmented
// progress bar and Start, then the ranked Cold Prospects list.
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
  const target = progress.target ?? queue.length;
  const remaining = Math.max(0, target - progress.worked);
  const firstOpen = queue.find((c) => isDue(c.nextEligibleDate)) ?? queue[0];
  const dateLine = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const nav: { icon: string; label: string; href?: string; current?: boolean }[] = [
    { icon: "ph-target", label: "Prospects", href: "/rep", current: true },
    { icon: "ph-bell-ringing", label: "Follow-ups" },
    { icon: "ph-map-pin", label: "ZIP", href: "/rep#zip" },
    { icon: "ph-address-book", label: "Contacts", href: "/rep/contacts" },
    { icon: "ph-trophy", label: "Leaders", href: "/rep/leaders" },
  ];

  return (
    <div
      style={{
        ...brandRampVars(distributor?.primaryColor),
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      {/* Sticky branded header + nav */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "var(--bg)",
          boxShadow: "0 1px 0 var(--divider)",
          padding: "max(16px, env(safe-area-inset-top)) 16px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px" }}>
          <span style={{ fontSize: 18, fontWeight: 600, color: "var(--accent-500)" }}>
            {distributor?.name ?? "Upfit Opps"}
          </span>
          <form action={repLogout} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: "var(--neutral-200)",
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 600,
              }}
              aria-hidden
            >
              {initials}
            </div>
            <button type="submit" className="btn btn-ghost" style={{ minHeight: 34, fontSize: 13 }}>
              Sign out
            </button>
          </form>
        </div>
        <nav style={{ display: "flex", justifyContent: "space-between", gap: 4 }}>
          {nav.map((n) => {
            const inner = (
              <>
                <i className={`ph-duotone ${n.icon}`} style={{ fontSize: 24, color: "var(--accent-500)" }} />
                <span style={{ fontSize: 11 }}>{n.label}</span>
              </>
            );
            const style: React.CSSProperties = {
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
              minHeight: 50,
              padding: "5px 2px",
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              color: n.current ? "var(--accent-700)" : "var(--neutral-800)",
            };
            return n.href ? (
              <Link key={n.label} href={n.href} style={style}>{inner}</Link>
            ) : (
              <div key={n.label} style={style}>{inner}</div>
            );
          })}
        </nav>
      </header>

      <div style={{ flex: 1, padding: "24px 20px 56px", display: "flex", flexDirection: "column", gap: 44 }}>
        {/* Progress hero */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 13, color: "var(--neutral-700)" }}>
            {dateLine} · {user?.email}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 56, fontWeight: 600, lineHeight: 0.9, letterSpacing: "-0.02em" }}>
                {progress.worked}
              </span>
              <span style={{ fontSize: 22, color: "var(--neutral-700)" }}>/ {target}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, textAlign: "right", color: "var(--accent-700)", paddingBottom: 4 }}>
              {remaining > 0 ? `${remaining} to go` : "Goal reached"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: Math.max(target, 1) }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 14,
                  borderRadius: "var(--radius-md)",
                  background: i < progress.worked ? "var(--accent-500)" : "var(--neutral-200)",
                }}
              />
            ))}
          </div>
          {firstOpen && (
            <Link
              href={`/rep/company/${firstOpen.id}`}
              className="btn btn-primary"
              style={{ minHeight: 56, fontSize: 18, marginTop: 6 }}
            >
              <i className="ph-duotone ph-play" style={{ fontSize: 20 }} />
              <span>Start</span>
            </Link>
          )}
        </section>

        {/* Cold prospects */}
        <section style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
              <i className="ph-duotone ph-target" style={{ fontSize: 26 }} />
              <span>Cold Prospects</span>
            </h3>
            <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Ranked by priority</span>
          </div>

          {queue.map((c, i) => {
            const due = isDue(c.nextEligibleDate);
            return (
              <Link
                key={c.id}
                href={`/rep/company/${c.id}`}
                style={{
                  cursor: "pointer",
                  display: "grid",
                  gridTemplateColumns: "26px minmax(0,1fr) auto 16px",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 8px",
                  margin: "0 -8px",
                  borderRadius: "var(--radius-md)",
                  textDecoration: "none",
                  color: "inherit",
                  opacity: due ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 17, color: "var(--neutral-600)" }}>{i + 1}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.25 }}>{c.name}</span>
                  <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
                    {[c.city, c.industryPrimary].filter(Boolean).join(" · ")}
                    {!due && c.nextEligibleDate ? ` · eligible ${c.nextEligibleDate}` : ""}
                  </span>
                </div>
                <span style={{ fontSize: 18, fontWeight: 600 }}>{c.priorityScore ?? "—"}</span>
                <i className="ph-duotone ph-caret-right" style={{ fontSize: 16, color: "var(--neutral-600)" }} />
              </Link>
            );
          })}

          {queue.length === 0 && (
            <p style={{ fontSize: 14, color: "var(--neutral-700)", padding: "16px 0" }}>
              Your queue is clear. Nice work — new prospects appear here once assigned.
            </p>
          )}
        </section>

        <ZipSearch apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} />
      </div>
    </div>
  );
}
