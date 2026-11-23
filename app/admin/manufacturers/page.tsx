import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../admin-shell";
import { ManufacturersManager } from "./manager";

// L2 Admin — Manufacturers: add a manufacturer, manage its portal users, and set
// the regional rep on each distributor program assignment.
export default async function AdminManufacturersPage() {
  const ctx = await requireAdmin();
  const [mfrs, me] = await Promise.all([
    data.getManufacturersDetail(ctx),
    getCurrentUser(),
  ]);

  return (
    <AdminShell active="manufacturers" userName={me?.name ?? me?.email}>
      <ManufacturersManager manufacturers={mfrs} />
    </AdminShell>
  );
}
