import { notFound } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../../admin-shell";
import { DistributorAccount } from "./account";

// L2 Admin — distributor account page (Overview / Branding / Users / Programs /
// Imports). Loads everything the account needs and hands it to the client.
export default async function DistributorAccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const account = await data.getDistributorAccount(ctx, id).catch(() => null);
  if (!account) notFound();
  const me = await getCurrentUser();

  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <DistributorAccount account={account} />
    </AdminShell>
  );
}
