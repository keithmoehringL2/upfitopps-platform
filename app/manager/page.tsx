import { requireRole, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { logout } from "@/lib/auth/actions";

// Manager Overview (apex, protected). First real authenticated screen: lists
// every company in the signed-in manager's distributor, read through the
// tenant-scoped gateway. The rich funnel/settings screens come later.
export default async function ManagerPage() {
  const ctx = await requireRole("manager");
  const [companies, user, distributor] = await Promise.all([
    data.listCompanies(ctx),
    getCurrentUser(),
    data.getDistributorById(ctx.distributorId!),
  ]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          borderBottom: "1px solid var(--divider)",
          paddingBottom: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--neutral-600)",
            }}
          >
            Manager Overview
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 600, margin: "4px 0 0", color: "var(--accent-700)" }}>
            {distributor?.name ?? "Distributor"}
          </h1>
        </div>
        <div style={{ textAlign: "right", fontSize: 13, color: "var(--neutral-700)" }}>
          <div>{user?.email}</div>
          <form action={logout} style={{ marginTop: 6 }}>
            <button
              type="submit"
              style={{
                fontFamily: "inherit",
                fontSize: 13,
                color: "var(--accent-700)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                textDecoration: "underline",
              }}
            >
              Log out
            </button>
          </form>
        </div>
      </header>

      <h2 style={{ fontSize: 17, fontWeight: 600, margin: "28px 0 12px" }}>
        Companies <span style={{ color: "var(--neutral-600)", fontWeight: 400 }}>({companies.length})</span>
      </h2>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "var(--neutral-600)", fontSize: 12 }}>
            <th style={th}>Company</th>
            <th style={th}>City</th>
            <th style={th}>ZIP</th>
            <th style={th}>Industry</th>
            <th style={{ ...th, textAlign: "right" }}>Priority</th>
            <th style={th}>Owner</th>
          </tr>
        </thead>
        <tbody>
          {companies.map((c) => (
            <tr key={c.id} style={{ borderTop: "1px solid var(--divider)" }}>
              <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
              <td style={td}>{c.city}</td>
              <td style={td}>{c.zip}</td>
              <td style={td}>{c.industryPrimary}</td>
              <td style={{ ...td, textAlign: "right" }}>{c.priorityScore ?? "—"}</td>
              <td style={td}>
                {c.ownerUserId ? (
                  "Assigned"
                ) : (
                  <span style={{ color: "var(--neutral-600)" }}>Unassigned</span>
                )}
              </td>
            </tr>
          ))}
          {companies.length === 0 && (
            <tr>
              <td colSpan={6} style={{ ...td, color: "var(--neutral-600)" }}>
                No companies yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td: React.CSSProperties = { padding: "10px 10px" };
