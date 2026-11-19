// L2 Admin portal (admin.upfitopps.com). Reserved subdomain, rewritten here by
// the middleware. Stub only — the real admin app (distributor provisioning,
// branding, users, CSV import) renders here behind L2-admin authentication.
export default function AdminHome() {
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
        admin.upfitopps.com
      </div>
      <h1 style={{ fontSize: 40, fontWeight: 600, margin: "8px 0 0" }}>
        L2 Admin Portal
      </h1>
      <p style={{ fontSize: 17, color: "var(--neutral-700)" }}>
        Reserved subdomain resolved. Distributor provisioning, white-label
        branding, users, manufacturer assignments and CSV import will live here,
        behind L2-admin authentication.
      </p>
    </main>
  );
}
