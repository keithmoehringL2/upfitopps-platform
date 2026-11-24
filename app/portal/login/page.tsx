import { PortalLoginForm } from "./login-form";

// Manufacturer portal sign-in. Served on the reserved `portal` subdomain (proxy
// rewrites portal.<root>/login → /portal/login).
export default function PortalLoginPage() {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "var(--font-serif)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--accent-700)" }}>UpfitOutreach</span>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: "24px 0 4px" }}>Manufacturer sign-in</h1>
        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 0 }}>
          Program reporting for manufacturer partners.
        </p>

        <PortalLoginForm />

        {isDev && (
          <div
            style={{
              fontSize: 13,
              color: "var(--neutral-600)",
              marginTop: 24,
              padding: "10px 12px",
              background: "var(--neutral-100)",
              borderRadius: "var(--radius-lg)",
              lineHeight: 1.6,
            }}
          >
            <strong>Demo accounts</strong> (password <code>upfit1234</code>):<br />
            regional@adriansteel.test — Regional<br />
            skim@adriansteel.test — Leadership
          </div>
        )}
      </div>
    </main>
  );
}
