import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRep } from "@/lib/auth/dal";
import { data } from "@/lib/db/gateway";
import { outcomeMeta, EVENT_ICONS } from "@/lib/rep/outcomes";
import { brandRampVars } from "@/lib/brand/ramp";
import { LogOutcomeForm } from "./log-form";
import { DecisionMakerSection, QuoteSection, type DecisionMaker } from "./detail-extras";

export default async function RepCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireRep();

  const company = await data.getCompanyInScope(ctx, id);
  if (!company) notFound();

  const [interactions, queue, distributor] = await Promise.all([
    data.listInteractions(ctx, id),
    data.listRepQueue(ctx),
    data.getDistributorById(ctx.distributorId!),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const qIndex = queue.findIndex((c) => c.id === id);
  const position = qIndex >= 0 ? `${qIndex + 1} of ${queue.length} today` : "";

  const total = company.totalVehicles ?? (company.truckCount ?? 0) + (company.vanCount ?? 0);
  const last = interactions[0];
  const lastLabel = last
    ? `${outcomeMeta(last.outcome)?.label ?? last.outcome}, ${fmtDate(last.createdAt)}`
    : "None yet";
  const nextLabel = company.suppressed
    ? "—"
    : !company.nextEligibleDate || company.nextEligibleDate <= today
      ? "Eligible now"
      : company.nextEligibleDate >= "3000-01-01"
        ? "No follow-up"
        : company.nextEligibleDate;

  const [stateLabel, stateClass] = company.suppressed
    ? [company.suppressed === "dnc" ? "Do not contact" : "Removed from outreach", "tag-accent-2"]
    : company.lifecycleState === "opp"
      ? ["Opportunity identified", "tag-accent-2"]
      : company.lifecycleState === "customer"
        ? ["Existing customer", "tag-neutral"]
        : ["Cold prospect", "tag-accent"];

  const tel = company.phone ? "tel:" + company.phone.replace(/\D/g, "") : undefined;
  const mapUrl = company.address
    ? "https://maps.google.com/?q=" +
      encodeURIComponent([company.address, company.city, company.state, company.zip].filter(Boolean).join(", "))
    : undefined;
  const webUrl = company.website
    ? company.website.startsWith("http")
      ? company.website
      : "https://" + company.website
    : undefined;

  return (
    <div
      style={{
        ...brandRampVars(distributor?.primaryColor),
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      <div style={{ padding: "16px 20px calc(96px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 32 }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/rep" className="btn btn-ghost" style={{ fontSize: 15, paddingLeft: 0, minHeight: 44 }}>
            <i className="ph-duotone ph-caret-left" />
            <span>Queue</span>
          </Link>
          {position && <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{position}</span>}
        </div>

        {/* Identity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <h2 style={{ margin: 0, fontSize: 27, fontWeight: 600, lineHeight: 1.12, textWrap: "pretty" }}>
              {company.name}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: "none" }}>
              <span style={{ fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{company.priorityScore ?? "—"}</span>
              <span style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>
                priority / 5
              </span>
            </div>
          </div>
          {(company.industryPrimary || company.industrySub) && (
            <div style={{ fontSize: 14, color: "var(--neutral-800)" }}>
              {[company.industryPrimary, company.industrySub].filter(Boolean).join(" · ")}
            </div>
          )}
          <div style={{ fontSize: 14, color: "var(--neutral-800)" }}>
            {[company.address, company.city, company.state, company.zip].filter(Boolean).join(", ")}
          </div>
          {(total > 0 || company.fleetMix != null) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
              <div style={{ display: "flex", gap: 20, alignItems: "baseline" }}>
                <div><span style={{ fontSize: 22, fontWeight: 600 }}>{total}</span> <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>vehicles</span></div>
                {company.truckCount != null && (
                  <div><span style={{ fontSize: 17, fontWeight: 600 }}>{company.truckCount}</span> <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>trucks</span></div>
                )}
                {company.vanCount != null && (
                  <div><span style={{ fontSize: 17, fontWeight: 600 }}>{company.vanCount}</span> <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>vans</span></div>
                )}
              </div>
              {company.fleetMix != null && (
                <div style={{ fontSize: 13, color: "var(--neutral-800)" }}>{String(company.fleetMix)}</div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 2 }}>
            <span className={`tag ${stateClass}`}>{stateLabel}</span>
            <span className="tag tag-neutral">Owner: You</span>
          </div>
        </div>

        {/* Call actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: -8 }}>
          <a href={tel} className="btn btn-primary" style={{ minHeight: 56, fontSize: 18 }}>
            <i className="ph-duotone ph-phone" style={{ fontSize: 22 }} />
            <span>{company.phone ? `Call ${company.phone}` : "No phone on file"}</span>
          </a>
          <div style={{ display: "flex", gap: 10 }}>
            <a href={mapUrl} target="_blank" className="btn btn-secondary" style={{ flex: 1, minHeight: 44 }}>
              <i className="ph-duotone ph-map-pin" />
              Directions
            </a>
            <a href={webUrl} target="_blank" className="btn btn-secondary" style={{ flex: 1, minHeight: 44 }}>
              <i className="ph-duotone ph-globe" />
              Website
            </a>
          </div>
        </div>

        {/* Attempts / Last / Next */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
            <Stat label="Attempts" value={String(interactions.length)} />
            <Stat label="Last" value={lastLabel} small />
            <Stat label="Next" value={nextLabel} small />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h5 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Activity</h5>
            {interactions.length === 0 && (
              <span style={{ fontSize: 14, color: "var(--neutral-700)" }}>No recorded outreach yet.</span>
            )}
            {interactions.map((i) => {
              const def = outcomeMeta(i.outcome) ?? EVENT_ICONS[i.outcome];
              return (
                <div key={i.id} style={{ display: "grid", gridTemplateColumns: "22px 1fr", gap: 10 }}>
                  <i className={`ph-duotone ${def?.icon ?? "ph-circle"}`} style={{ fontSize: 18, color: "var(--accent-700)", paddingTop: 2 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{def?.label ?? i.outcome}</span>
                    <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>
                      {fmtDate(i.createdAt)} · {i.repEmail}
                    </span>
                    {i.note && <span style={{ fontSize: 14, color: "var(--neutral-800)" }}>{i.note}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Log outcome */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 8, fontSize: 25, fontWeight: 600 }}>
            <i className="ph-duotone ph-phone-call" style={{ fontSize: 26 }} />
            <span>Log Outcome</span>
          </h3>
          <LogOutcomeForm companyId={company.id} />
        </div>

        <DecisionMakerSection
          companyId={company.id}
          initial={(company.decisionMaker as DecisionMaker | null) ?? null}
          confirmedAt={company.decisionMakerAt ? fmtDate(company.decisionMakerAt) : null}
        />

        <QuoteSection companyId={company.id} count={company.quoteCount ?? 0} />
      </div>
    </div>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>
        {label}
      </span>
      <span style={{ fontSize: small ? 14 : 22, fontWeight: small ? 400 : 600, lineHeight: 1.3 }}>{value}</span>
    </div>
  );
}

function fmtDate(d: Date | string): string {
  const date = new Date(d);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "Today";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
