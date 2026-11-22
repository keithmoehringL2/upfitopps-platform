import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../../../admin-shell";

// Placeholder — the 4-step CSV import (Upload → Map → Preview → Done) arrives in
// the next phase.
export default async function ImportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const [dist, me] = await Promise.all([data.getDistributorById(id), getCurrentUser()]);
  if (!dist) notFound();

  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <Link href={`/distributors/${id}`} className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" /><span>{dist.name}</span>
      </Link>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Import companies</h1>
      <p style={{ fontSize: 15, color: "var(--neutral-700)" }}>
        The CSV import flow (Upload → Map columns → Preview → Done) arrives in the next phase.
      </p>
    </AdminShell>
  );
}
