import Link from "next/link";
import { notFound } from "next/navigation";
import { data } from "@/lib/db/gateway";
import { brandRampCss } from "@/lib/brand/ramp";
import { BrandMark } from "@/app/brand-mark";

// Distributor landing (<slug>.<root>/): the UpfitOutreach logo, the distributor
// name, and a choice of Manager or Rep sign-in. Served here because the proxy
// rewrites the tenant root into this /t/[slug] route, which resolves the
// distributor from the subdomain slug. The distributor's brand color themes it.
export default async function TenantHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const distributor = await data.getDistributorBySlug(slug);
  if (!distributor) notFound();

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: brandRampCss(distributor.primaryColor, distributor.secondaryColor),
        }}
      />
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          fontFamily: "var(--font-serif)",
          color: "var(--text)",
          background: "var(--bg)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", alignItems: "center", gap: 28, textAlign: "center" }}>
          <BrandMark height={40} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600, lineHeight: 1.15 }}>{distributor.name}</h1>
            <p style={{ margin: 0, fontSize: 15, color: "var(--neutral-700)" }}>Choose how you&rsquo;d like to sign in.</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%" }}>
            <Link href="/login" className="btn btn-primary" style={{ minHeight: 54, fontSize: 17 }}>
              <i className="ph-duotone ph-briefcase" style={{ fontSize: 20 }} /><span>Manager login</span>
            </Link>
            <Link href="/rep/login" className="btn btn-secondary" style={{ minHeight: 54, fontSize: 17 }}>
              <i className="ph-duotone ph-steering-wheel" style={{ fontSize: 20 }} /><span>Rep login</span>
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
