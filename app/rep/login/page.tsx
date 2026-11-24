import Link from "next/link";
import { RepLoginForm } from "./rep-login-form";

// Rep passwordless login (mobile-first). Reps never set a password — they
// request a one-time link and the device holds a long-lived session after.
export default async function RepLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
      <div style={{ width: "100%", maxWidth: 420 }}>
        <Link
          href="/"
          style={{ fontSize: 20, fontWeight: 600, color: "var(--accent-700)", textDecoration: "none" }}
        >
          UpfitOutreach
        </Link>
        <h1 style={{ fontSize: 32, fontWeight: 600, margin: "24px 0 4px" }}>Rep sign-in</h1>
        <p style={{ fontSize: 15, color: "var(--neutral-600)", marginTop: 0 }}>
          Enter your work email and we&rsquo;ll send a one-tap sign-in link.
        </p>

        {error === "link" && (
          <p
            style={{
              fontSize: 14,
              color: "var(--accent-700)",
              background: "var(--neutral-100)",
              border: "1px solid var(--divider)",
              borderRadius: "var(--radius-lg)",
              padding: "10px 12px",
              marginTop: 16,
            }}
          >
            That link was invalid or expired. Request a fresh one below.
          </p>
        )}

        <RepLoginForm />

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
          <strong>Demo rep:</strong> rep1@truckcolors.test
        </p>
      </div>
    </main>
  );
}
