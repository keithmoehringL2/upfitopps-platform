// Manufacturer portal (portal.upfitopps.com). Reserved subdomain, rewritten
// here by the middleware. Stub only — the real portal shows AGGREGATE-ONLY,
// cohort-scoped reporting. It must never expose company names, contacts,
// rep-level data or financials (see BUILD_PLAN_architecture_and_security.md §8).
export default function PortalHome() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <div
        style={{
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--neutral-600)",
        }}
      >
        portal.upfitopps.com
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, margin: "8px 0 0" }}>
        Manufacturer Portal
      </h1>
      <p style={{ fontSize: 17, color: "var(--neutral-700)" }}>
        Reserved subdomain resolved. Regional and leadership users will see
        aggregate-only, program-scoped reporting here — no company, contact or
        rep identifiers, enforced in server queries and exports.
      </p>
    </main>
  );
}
