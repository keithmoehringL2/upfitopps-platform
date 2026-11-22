import Link from "next/link";
import { requireAdmin, getCurrentUser } from "@/lib/auth/dal";
import { AdminShell } from "../../admin-shell";

// Placeholder — the New Distributor wizard (Account → Branding → Users →
// Program → Review) arrives in the next phase.
export default async function NewDistributorPage() {
  await requireAdmin();
  const me = await getCurrentUser();
  return (
    <AdminShell active="distributors" userName={me?.name ?? me?.email}>
      <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" />
        <span>Distributors</span>
      </Link>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>New distributor</h1>
      <p style={{ fontSize: 15, color: "var(--neutral-700)" }}>
        The provisioning wizard arrives in the next phase.
      </p>
    </AdminShell>
  );
}
