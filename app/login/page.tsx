import Link from "next/link";

// Manager login (apex). Stub only — no authentication is wired yet.
// Per the PRD, managers sign in here with username/password and are then
// routed to their distributor's subdomain. Reps use passwordless email links;
// manufacturers use the separate portal.
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
        <h1 style={{ fontSize: 34, fontWeight: 600, margin: "24px 0 4px" }}>
          Sign in
        </h1>
        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 0 }}>
          Distributor managers only. This is a non-functional placeholder.
        </p>

        <form style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Username or email
            <input
              type="text"
              name="username"
              autoComplete="username"
              style={inputStyle}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              style={inputStyle}
            />
          </label>
          <button type="button" disabled style={buttonStyle}>
            Sign in
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--neutral-600)", marginTop: 20 }}>
          Forgot your password? (coming soon)
        </p>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  fontSize: 15,
  fontFamily: "inherit",
  border: "1px solid var(--neutral-300)",
  borderRadius: "var(--radius-lg)",
  background: "#fff",
};

const buttonStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "13px 16px",
  fontSize: 16,
  fontWeight: 600,
  fontFamily: "inherit",
  color: "#fff",
  background: "var(--accent-500)",
  border: "none",
  borderRadius: "var(--radius-lg)",
  cursor: "not-allowed",
  opacity: 0.55,
};
