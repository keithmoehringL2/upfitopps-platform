import Link from "next/link";
import { brandRampVars } from "@/lib/brand/ramp";
import { UserMenu } from "./user-menu";

// Shared manager chrome: branded top bar + nav, matching the Manager desktop
// prototype. Each page passes its active tab and content.
export function ManagerShell({
  brandName,
  primaryColor,
  userEmail,
  active,
  children,
}: {
  brandName: string;
  primaryColor?: string;
  userEmail?: string;
  active: "overview" | "companies" | "settings";
  children: React.ReactNode;
}) {
  // Settings lives in the account menu, not the nav bar.
  const tabs = [
    { key: "overview", label: "Overview", href: "/manager" },
    { key: "companies", label: "Companies", href: "/manager/companies" },
  ] as const;

  return (
    <div
      style={{
        ...brandRampVars(primaryColor),
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
          padding: "18px 32px",
          boxShadow: "0 1px 0 var(--divider)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--accent-500)" }}>{brandName}</span>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Manager</span>
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
        <div style={{ marginLeft: "auto" }}>
          {userEmail && <UserMenu email={userEmail} />}
        </div>
      </header>

      <main style={{ maxWidth: 1320, margin: "0 auto", padding: "40px 32px 120px", display: "flex", flexDirection: "column", gap: 28 }}>
        {children}
      </main>
    </div>
  );
}
