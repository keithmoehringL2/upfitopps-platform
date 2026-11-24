import { requireRole, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { ManagerShell } from "../manager-shell";
import { CompaniesTable } from "../companies-table";

// Manager Companies view: the full roster for the distributor, with multi-select
// assignment to reps. Reading is through the tenant-scoped gateway.
export default async function ManagerCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const { owner } = await searchParams;
  const ctx = await requireRole("manager");
  const [companies, reps, distributor, user] = await Promise.all([
    data.listCompanies(ctx),
    data.listReps(ctx),
    data.getDistributorById(ctx.distributorId!),
    getCurrentUser(),
  ]);

  const rows = companies.map((c) => ({
    id: c.id,
    name: c.name,
    city: c.city,
    zip: c.zip,
    industryPrimary: c.industryPrimary,
    priorityScore: c.priorityScore,
    ownerUserId: c.ownerUserId,
    lifecycleState: c.lifecycleState,
    suppressed: c.suppressed,
    lastTouchDate: c.lastTouchDate,
  }));

  return (
    <ManagerShell
      brandName={distributor?.name ?? "Distributor"}
      primaryColor={distributor?.primaryColor}
      secondaryColor={distributor?.secondaryColor}
      logoUrl={distributor?.logoUrl}
      userEmail={user?.email}
      active="companies"
    >
      <CompaniesTable
        companies={rows}
        reps={reps.map((r) => ({ id: r.id, email: r.email }))}
        initialOwner={owner}
      />
    </ManagerShell>
  );
}
