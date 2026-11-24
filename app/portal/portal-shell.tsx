import { portalLogout } from "@/lib/auth/actions";

// Manufacturer portal chrome: platform-red header with the manufacturer name, a
// scope tag, the signed-in user and sign-out. Aggregate-only reporting — no
// distributor brand applied.
export function PortalShell({
  manufacturerName,
  scopeLabel,
  userName,
  userRole,
  children,
}: {
  manufacturerName: string;
  scopeLabel?: string;
  userName?: string | null;
  userRole?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--bg)", fontFamily: "var(--font-serif)", color: "var(--text)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          padding: "18px 48px",
          boxShadow: "0 1px 0 var(--divider)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--accent-700)" }}>UpfitOutreach</span>
          <span style={{ fontSize: 15, fontWeight: 600 }}>{manufacturerName}</span>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Program reporting</span>
        </div>
        {scopeLabel && <span className="tag tag-accent">{scopeLabel}</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{userName ?? "Partner"}</span>
            <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>
              {userRole === "mfr_leadership" ? "Leadership" : "Regional"}
            </span>
          </div>
          <form action={portalLogout}>
            <button type="submit" className="btn btn-ghost" style={{ minHeight: 36, fontSize: 13 }}>Sign out</button>
          </form>
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "44px 48px 120px", display: "flex", flexDirection: "column", gap: 36 }}>
        {children}
      </main>
    </div>
  );
}
