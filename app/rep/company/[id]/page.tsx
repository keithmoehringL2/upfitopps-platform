import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRep } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { outcomeMeta } from "@/lib/rep/outcomes";
import { LogOutcomeForm } from "./log-form";

// Company detail for a rep: the context they need to make the call, the outcome
// logger, and the recent history. Scope is enforced in the gateway — a rep can
// only open a company they own; anything else 404s.
export default async function RepCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRep();

  const company = await data.getCompanyInScope(ctx, id);
  if (!company) notFound();

  const interactions = await data.listInteractions(ctx, id);

  const facts: [string, string | null | undefined][] = [
    ["Phone", company.phone],
    ["Address", [company.address, company.city, company.state, company.zip].filter(Boolean).join(", ") || null],
    ["Website", company.website],
    ["Industry", [company.industryPrimary, company.industrySub].filter(Boolean).join(" · ") || null],
    ["Fleet", company.totalVehicles != null ? `${company.totalVehicles} vehicles` : null],
  ];

  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: "16px 16px 56px", minHeight: "100dvh" }}>
      <Link href="/rep" style={{ fontSize: 14, color: "var(--neutral-700)", textDecoration: "none" }}>
        ← Queue
      </Link>

      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginTop: 14 }}>
        <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>{company.name}</h1>
        {company.priorityScore != null && (
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--accent-700)", whiteSpace: "nowrap" }}>
            ★ {company.priorityScore}
          </span>
        )}
      </div>

      {company.priorityExplanation && (
        <p style={{ fontSize: 14, color: "var(--neutral-700)", marginTop: 6 }}>{company.priorityExplanation}</p>
      )}

      <dl style={{ margin: "18px 0 0", display: "grid", gridTemplateColumns: "92px 1fr", rowGap: 8, columnGap: 12, fontSize: 14 }}>
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt style={{ color: "var(--neutral-600)" }}>{k}</dt>
              <dd style={{ margin: 0, color: "var(--neutral-900)" }}>{v}</dd>
            </div>
          ))}
      </dl>

      {company.description && (
        <p style={{ fontSize: 14, color: "var(--neutral-700)", marginTop: 16, lineHeight: 1.55 }}>{company.description}</p>
      )}

      <section
        style={{
          marginTop: 24,
          padding: "18px 16px",
          background: "var(--neutral-100)",
          borderRadius: "var(--radius-lg)",
        }}
      >
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: "0 0 14px" }}>Log an outcome</h2>
        <LogOutcomeForm companyId={company.id} />
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 14, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)", fontWeight: 600, margin: "0 0 12px" }}>
          History ({interactions.length})
        </h2>
        {interactions.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--neutral-600)" }}>No contact logged yet.</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {interactions.map((i) => (
              <li key={i.id} style={{ borderLeft: "2px solid var(--divider)", paddingLeft: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>
                  {outcomeMeta(i.outcome)?.label ?? i.outcome}
                  <span style={{ fontWeight: 400, color: "var(--neutral-600)" }}> · {i.channel}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--neutral-600)" }}>
                  {new Date(i.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {" · "}
                  {i.repEmail}
                </div>
                {i.note && <div style={{ fontSize: 14, color: "var(--neutral-700)", marginTop: 3 }}>{i.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
