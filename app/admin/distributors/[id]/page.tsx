import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { AdminShell } from "../../admin-shell";

// Placeholder — the distributor account page (Overview / Branding / Users /
// Programs / Imports tabs) arrives in a later phase. For now it confirms the
// distributor resolves and links back.
export default async function DistributorAccountPage({
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
      <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" />
        <span>Distributors</span>
      </Link>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>{dist.name}</h1>
      <p style={{ fontSize: 15, color: "var(--neutral-700)" }}>
        The account page (Overview, Branding, Users, Programs, Imports) arrives in a later phase.
      </p>
    </AdminShell>
  );
}
