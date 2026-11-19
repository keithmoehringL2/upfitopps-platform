import { notFound } from "next/navigation";
import { data } from "@/lib/db/gateway";
import { brandRampCss } from "@/lib/brand/ramp";

// Tenant workspace (<slug>.upfitopps.com). The proxy rewrites tenant hosts into
// this `/t/[slug]` segment. Placeholder: it proves host -> tenant resolution and
// runtime white-label branding. The real rep/manager app renders here.
export default async function TenantHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const distributor = await data.getDistributorBySlug(slug);

  if (!distributor) {
    notFound();
  }

  return (
    <>
      {/* Per-tenant accent ramp derived from the distributor's primary color. */}
      <style
        dangerouslySetInnerHTML={{
          __html: brandRampCss(distributor.primaryColor),
        }}
      />
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
        <div
          style={{
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--neutral-600)",
          }}
        >
          Distributor workspace · {slug}.upfitopps.com
        </div>
        <h1
          style={{
            fontSize: 40,
            fontWeight: 600,
            margin: "8px 0 0",
            color: "var(--accent-700)",
          }}
        >
          {distributor.name}
        </h1>
        <p style={{ fontSize: 17, color: "var(--neutral-700)" }}>
          Host-based tenant routing resolved this subdomain to{" "}
          <strong>{distributor.id}</strong>. The rep and manager surfaces will
          render here, branded from this tenant&rsquo;s primary color.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 24,
            alignItems: "center",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: "var(--radius-lg)",
              background: "var(--accent-500)",
              boxShadow: "var(--shadow-sm)",
            }}
          />
          <code style={{ fontSize: 14, color: "var(--neutral-700)" }}>
            primary {distributor.primaryColor}
          </code>
        </div>
      </main>
    </>
  );
}
