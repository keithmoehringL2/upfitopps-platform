import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../../admin-shell";
import { DistributorWizard } from "./wizard";

// L2 Admin — New Distributor wizard (Account → Branding → Users → Program →
// Review). The program catalog (manufacturer programs + their regional users)
// is fetched here and passed to the client wizard.
export default async function NewDistributorPage() {
  const ctx = await requireAdmin();
  const [catalog, me] = await Promise.all([
    data.listProgramCatalog(ctx),
    getCurrentUser(),
  ]);

  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <DistributorWizard catalog={catalog} />
    </AdminShell>
  );
}
