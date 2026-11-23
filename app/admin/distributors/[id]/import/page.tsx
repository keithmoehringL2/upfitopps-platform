import { notFound } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../../../admin-shell";
import { ImportWizard } from "./import-wizard";

// L2 Admin — CSV import (Upload → Map columns → Preview → Done) for one
// distributor. Fetches a sample owner email + program code so the "Use sample
// file" button produces a valid import for this distributor.
export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireAdmin();
  const account = await data.getDistributorAccount(ctx, id).catch(() => null);
  if (!account) notFound();
  const me = await getCurrentUser();

  const sampleOwnerEmail = account.reps.find((r) => r.status === "active")?.email ?? "";
  const assigned = account.catalog.find((c) => account.assignments.some((a) => a.programId === c.id));
  const sampleProgramCode = assigned?.code ?? "";

  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <ImportWizard
        distributorId={id}
        distributorName={account.distributor.name}
        sampleOwnerEmail={sampleOwnerEmail}
        sampleProgramCode={sampleProgramCode}
      />
    </AdminShell>
  );
}
