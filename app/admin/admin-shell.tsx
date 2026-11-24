import Link from "next/link";
import { adminLogout } from "@/lib/auth/actions";
import { BrandMark } from "@/app/brand-mark";

// Shared L2 Admin chrome: platform-red top bar + nav (Distributors /
// Manufacturers) + the signed-in admin and sign-out. The admin chrome is always
// the platform accent — a distributor's own color only appears in list tiles
// and branding previews — so no brand ramp is applied here.
export function AdminShell({
  active,
  userName,
  children,
}: {
  active: "distributors" | "manufacturers";
  userName?: string | null;
  children: React.ReactNode;
}) {
  const tabs = [
    { key: "distributors", label: "Distributors", href: "/" },
    { key: "manufacturers", label: "Manufacturers", href: "/manufacturers" },
  ] as const;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 40,
          padding: "18px 48px",
          boxShadow: "0 1px 0 var(--divider)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <BrandMark height={32} />
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>L2 Admin</span>
        </div>
        <nav style={{ display: "flex", gap: 28 }}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              style={{
                fontSize: 16,
                padding: "6px 0",
                textDecoration: "none",
                color: active === t.key ? "var(--accent-700)" : "var(--text)",
                boxShadow: active === t.key ? "inset 0 -2px 0 var(--accent-500)" : "none",
              }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{userName ?? "L2 Admin"}</span>
            <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>L2 Digital</span>
          </div>
          <form action={adminLogout}>
            <button type="submit" className="btn btn-ghost" style={{ minHeight: 36, fontSize: 13 }}>
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "44px 48px 120px", display: "flex", flexDirection: "column", gap: 40 }}>
        {children}
      </main>
    </div>
  );
}
