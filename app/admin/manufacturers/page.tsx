import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../admin-shell";

// L2 Admin — Manufacturers. Read-only list for now; add-manufacturer, portal
// users and program assignments arrive in a later phase.
export default async function AdminManufacturersPage() {
  const ctx = await requireAdmin();
  const [mfrs, me] = await Promise.all([
    data.listManufacturersOverview(ctx),
    getCurrentUser(),
  ]);

  return (
    <AdminShell active="manufacturers" userName={me?.name ?? me?.email}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>
          Each manufacturer sees only its own program data
        </div>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Manufacturers</h1>
      </div>

      {mfrs.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No manufacturers yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {mfrs.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <i className="ph-duotone ph-factory" style={{ fontSize: 24, color: "var(--accent-700)" }} />
              <span style={{ fontSize: 20, fontWeight: 600 }}>{m.name}</span>
              <span className="tag tag-neutral">{m.userCount} user{m.userCount === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--neutral-600)" }}>
        Adding manufacturers, portal users and program assignments arrives in a later phase.
      </p>
    </AdminShell>
  );
}
