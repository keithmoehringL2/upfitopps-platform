import Link from "next/link";
import { requireRep } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { brandRampVars } from "@/lib/brand/ramp";
import { ContactsTable } from "./contacts-table";

// Rep "My Contacts": every company the rep owns, with filters. Read through the
// tenant-scoped gateway (rep scope = owned companies).
export default async function RepContactsPage() {
  const ctx = await requireRep();
  const [companies, distributor] = await Promise.all([
    data.listCompanies(ctx),
    data.getDistributorById(ctx.distributorId!),
  ]);

  const rows = companies.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    zip: c.zip,
    industryPrimary: c.industryPrimary,
    priorityScore: c.priorityScore,
    lifecycleState: c.lifecycleState,
    suppressed: c.suppressed,
  }));

  return (
    <div
      style={{
        ...brandRampVars(distributor?.primaryColor),
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      <header
        style={{
          padding: "max(16px, env(safe-area-inset-top)) 20px 8px",
          boxShadow: "0 1px 0 var(--divider)",
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          zIndex: 2,
        }}
      >
        <Link href="/rep" className="btn btn-ghost" style={{ paddingLeft: 0, minHeight: 44, fontSize: 15 }}>
          <i className="ph-duotone ph-caret-left" />
          <span>Queue</span>
        </Link>
      </header>

      <div style={{ padding: "16px 20px 48px" }}>
        <ContactsTable companies={rows} />
      </div>
    </div>
  );
}
