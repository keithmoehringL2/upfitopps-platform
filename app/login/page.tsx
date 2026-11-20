import Link from "next/link";
import { LoginForm } from "./login-form";

// Manager login (apex). Reps use passwordless email links; manufacturers use
// the separate portal.
export default function LoginPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 380 }}>
        <Link
          href="/"
          style={{ fontSize: 20, fontWeight: 600, color: "var(--accent-700)", textDecoration: "none" }}
        >
          Upfit Opps
        </Link>
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: "24px 0 4px" }}>Sign in</h1>
        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 0 }}>
          Distributor managers only.
        </p>

        <LoginForm />

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
          <strong>Demo login:</strong> manager@truckcolors.test · upfit1234
        </p>
      </div>
    </main>
  );
}
