import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "./admin-shell";
import { DistributorsTable, type DistributorRow } from "./distributors-table";

// L2 Admin portal home — the Distributors list (screen 07). Reserved `admin`
// subdomain, gated to l2_admin.
export default async function AdminDistributorsPage() {
  const ctx = await requireAdmin();
  const [dists, me] = await Promise.all([
    data.listDistributorsOverview(ctx),
    getCurrentUser(),
  ]);

  const rows: DistributorRow[] = dists.map((d) => ({
    id: d.id,
    name: d.name,
    slug: d.slug,
    primaryColor: d.primaryColor,
    status: d.status as DistributorRow["status"],
    companyCount: d.companyCount,
    repCount: d.repCount,
    managerName: d.managerName,
    programs: d.programs,
    lastImport: d.lastImport,
  }));

  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <DistributorsTable rows={rows} />
    </AdminShell>
  );
}
