import Link from "next/link";
import { BrandMark } from "@/app/brand-mark";

// Apex (upfitoutreach.com): the public one-page site + the front door to sign in.
// This is a placeholder for the real marketing one-pager — structure and
// routing are real; copy and visual design come in a later pass.
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--divider)",
        }}
      >
        <BrandMark height={34} />
        <Link
          href="/login"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#fff",
            background: "var(--accent-500)",
            padding: "10px 18px",
            borderRadius: "var(--radius-lg)",
            textDecoration: "none",
          }}
        >
          Log in
        </Link>
      </header>

      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: 720,
          margin: "0 auto",
          padding: "48px 24px",
        }}
      >
        <h1 style={{ fontSize: 44, fontWeight: 600, lineHeight: 1.15, margin: 0 }}>
          Less prospect research. More consistent outreach.
        </h1>
        <p style={{ fontSize: 18, color: "var(--neutral-700)", marginTop: 20 }}>
          A market development platform for commercial vehicle distributors.
          Prioritized outreach queues, documented outcomes, and reporting your
          manufacturer partners can trust — without the busywork.
        </p>

        <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap" }}>
          <Link
            href="/login"
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent-500)",
              padding: "14px 24px",
              borderRadius: "var(--radius-lg)",
              textDecoration: "none",
            }}
          >
            Manager sign in
          </Link>
        </div>

        <p style={{ fontSize: 14, color: "var(--neutral-600)", marginTop: 28 }}>
          Sales reps: open the daily email we send you — no password needed.
          <br />
          Manufacturer partners: visit your reporting portal.
        </p>
      </section>

      <footer
        style={{
          padding: "20px 24px",
          borderTop: "1px solid var(--divider)",
          fontSize: 13,
          color: "var(--neutral-600)",
        }}
      >
        © {new Date().getFullYear()} L2 Digital · UpfitOutreach
      </footer>
    </main>
  );
}
