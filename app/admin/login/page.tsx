import { AdminLoginForm } from "./login-form";

// L2 Admin sign-in. Served on the reserved `admin` subdomain (proxy rewrites
// admin.<root>/login → /admin/login). The platform-red accent is the default,
// so no brand ramp is applied here.
export default function AdminLoginPage() {
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
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 600, color: "var(--accent-700)" }}>UpfitOutreach</span>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>L2 Admin</span>
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: "24px 0 4px" }}>Sign in</h1>
        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 0 }}>
          L2 Digital administrators only.
        </p>

        <AdminLoginForm />

        {isDev && (
          <p
            style={{
              fontSize: 13,
              color: "var(--neutral-600)",
              marginTop: 24,
              padding: "10px 12px",
              background: "var(--neutral-100)",
              borderRadius: "var(--radius-lg)",
            }}
          >
            <strong>Demo login:</strong> admin@l2-digital.test · upfit1234
          </p>
        )}
      </div>
    </main>
  );
}
