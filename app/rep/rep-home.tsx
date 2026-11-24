"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { brandRampVars } from "@/lib/brand/ramp";
import { repLogout } from "@/lib/rep/actions";
import { getDaySnapshot, getSkipped } from "@/lib/rep/session-state";
import { QueueList, type QueueRow } from "./queue-list";
import { FollowUps, type Reminder } from "./follow-ups";
import { CustomersList, type CustomerRow } from "./customers-list";
import { ZipSearch } from "./zip-search";
import { LeadersPanel, type Board } from "./leaders-panel";
import { CategoryPanel, type PanelCounter } from "./category-panel";

export type PanelKey = "followups" | "prospects" | "customers" | "zip" | "leaders";
const CARD_PANELS: PanelKey[] = ["followups", "prospects", "customers", "zip", "leaders"];

function panelFromUrl(): PanelKey | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search).get("panel");
  return (CARD_PANELS as string[]).includes(p ?? "") ? (p as PanelKey) : null;
}

interface Props {
  distributorName: string;
  primaryColor: string | null;
  userEmail: string;
  dateLine: string;
  repName: string;
  progress: { worked: number; target: number | null };
  queue: QueueRow[];
  doneIds: string[];
  firstOpenId: string | null;
  followUpsDue: Reminder[];
  followUpsUpcoming: Reminder[];
  customersDue: CustomerRow[];
  leaderboardEnabled: boolean;
  initialBoard: Board;
  zipApiKey?: string;
  initialPanel: PanelKey | null;
}

export function RepHome(props: Props) {
  const {
    distributorName, primaryColor, userEmail, dateLine, repName,
    progress, queue, doneIds, firstOpenId,
    followUpsDue, followUpsUpcoming, customersDue,
    leaderboardEnabled, initialBoard, zipApiKey, initialPanel,
  } = props;

  const [panel, setPanel] = useState<PanelKey | null>(initialPanel);

  // Done-today, computed from the day-start snapshot ∩ worked-today (both live
  // in the browser), so worked follow-ups/customers keep counting toward "done".
  const [fuStat, setFuStat] = useState({ done: 0, total: followUpsDue.length, firstOpen: followUpsDue[0]?.id ?? null });
  const [custStat, setCustStat] = useState({ done: 0, total: customersDue.length, firstOpen: customersDue[0]?.id ?? null });

  useEffect(() => {
    const doneSet = new Set(doneIds);
    const skip = getSkipped();
    const fuSnap = getDaySnapshot("followups", followUpsDue);
    const fuOpen = fuSnap.filter((r) => !doneSet.has(r.id) && !skip.has(r.id));
    setFuStat({ done: fuSnap.filter((r) => doneSet.has(r.id)).length, total: fuSnap.length, firstOpen: fuOpen[0]?.id ?? null });
    const custSnap = getDaySnapshot("customers", customersDue);
    const custOpen = custSnap.filter((c) => !doneSet.has(c.id));
    setCustStat({ done: custSnap.filter((c) => doneSet.has(c.id)).length, total: custSnap.length, firstOpen: custOpen[0]?.id ?? null });
  }, [doneIds, followUpsDue, customersDue]);

  // Keep panel state and the URL in sync so Back closes the panel and a company
  // round-trip (open → back) restores it, and email deep-links land on a card.
  useEffect(() => {
    const onPop = () => setPanel(panelFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const fuOpenCount = Math.max(0, fuStat.total - fuStat.done);
  const custOpenCount = Math.max(0, custStat.total - custStat.done);

  const open = (key: PanelKey) => {
    setPanel(key);
    window.history.pushState(null, "", `/rep?panel=${key}`);
  };
  const close = () => {
    setPanel(null);
    window.history.pushState(null, "", "/rep");
  };

  const target = progress.target ?? queue.length;
  const worked = progress.worked;
  const remaining = Math.max(0, target - worked);
  const initials = (userEmail || "?").slice(0, 2).toUpperCase();

  return (
    <div
      style={{
        ...brandRampVars(primaryColor ?? undefined),
        minHeight: "100dvh",
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        fontFamily: "var(--font-serif)",
        color: "var(--text)",
      }}
    >
      {/* Header: distributor name left, avatar + sign-out right */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 2,
          background: "var(--bg)",
          boxShadow: "0 1px 0 var(--divider)",
          padding: "max(16px, env(safe-area-inset-top)) 20px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 600, color: "var(--accent-500)" }}>{distributorName}</span>
        <form action={repLogout} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            aria-hidden
            style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--neutral-200)", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600 }}
          >
            {initials}
          </div>
          <button type="submit" className="btn btn-ghost" style={{ minHeight: 34, fontSize: 13 }}>Sign out</button>
        </form>
      </header>

      <div style={{ flex: 1, padding: "24px 20px 128px", display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ margin: "0 0 8px", fontSize: 28, lineHeight: 1.3 }}>
          Contact outreach queue for <span style={{ fontWeight: 600 }}>{repName}</span> for{" "}
          <span style={{ fontWeight: 600 }}>{dateLine}</span>
        </p>

        <Card
          icon="ph-bell-ringing"
          title="Follow Ups"
          description="Follow up on previous attempts or conversations."
          number={fuOpenCount}
          numberLabel="DUE"
          status={fuStat.total > 0 ? `${fuStat.done} of ${fuStat.total} done` : "Nothing due today"}
          fill="var(--accent-100)"
          onClick={() => open("followups")}
        />
        <Card
          icon="ph-target"
          title="Prospects"
          description="Connect with these prospective customers."
          number={target}
          numberLabel="DAILY GOAL"
          status={worked >= target && target > 0 ? `Goal reached · ${worked} attempts` : `${worked} of ${target} attempted`}
          fill="var(--accent-500)"
          dark
          onClick={() => open("prospects")}
        />
        <Card
          icon="ph-user-check"
          title="Customers"
          description="Check in with these past customers."
          number={custOpenCount}
          numberLabel="DUE"
          status={custStat.total > 0 ? `${custStat.done} of ${custStat.total} checked in` : "None due"}
          fill="var(--neutral-200)"
          onClick={() => open("customers")}
        />
      </div>

      {/* Floating bottom nav */}
      <nav
        style={{
          position: "fixed",
          bottom: "calc(26px + env(safe-area-inset-bottom))",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 20,
          display: "flex",
          gap: 4,
          padding: 6,
          background: "var(--bg)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <NavButton icon="ph-map-pin" label="ZIP" onClick={() => open("zip")} />
        <NavLink icon="ph-address-book" label="Contacts" href="/rep/contacts" />
        {leaderboardEnabled && <NavButton icon="ph-trophy" label="Leaders" onClick={() => open("leaders")} />}
      </nav>

      {/* Panels */}
      {panel === "followups" && (
        <CategoryPanel
          icon="ph-bell-ringing"
          title="Follow Ups"
          description="Follow up on previous attempts or conversations."
          onClose={close}
          counter={
            fuStat.total > 0
              ? {
                  done: fuStat.done,
                  total: fuStat.total,
                  unit: "done",
                  toGoLabel: fuOpenCount > 0 ? `${fuOpenCount} to go` : "All done",
                  start: fuStat.firstOpen ? { href: `/rep/company/${fuStat.firstOpen}` } : null,
                }
              : null
          }
        >
          <FollowUps due={followUpsDue} upcoming={followUpsUpcoming} doneIds={doneIds} />
        </CategoryPanel>
      )}

      {panel === "prospects" && (
        <CategoryPanel
          icon="ph-target"
          title="Prospects"
          description="Connect with these prospective customers."
          onClose={close}
          counter={{
            done: worked,
            total: target,
            unit: "attempts",
            toGoLabel: remaining > 0 ? `${remaining} to go` : "Goal reached",
            start: firstOpenId ? { href: `/rep/company/${firstOpenId}` } : null,
          }}
        >
          <QueueList rows={queue} doneIds={doneIds} target={progress.target} />
        </CategoryPanel>
      )}

      {panel === "customers" && (
        <CategoryPanel
          icon="ph-user-check"
          title="Customers"
          description="Check in with these past customers."
          onClose={close}
          counter={
            custStat.total > 0
              ? {
                  done: custStat.done,
                  total: custStat.total,
                  unit: "checked in",
                  toGoLabel: custOpenCount > 0 ? `${custOpenCount} to go` : "All done",
                  start: custStat.firstOpen ? { href: `/rep/company/${custStat.firstOpen}` } : null,
                }
              : null
          }
        >
          <CustomersList due={customersDue} doneIds={doneIds} />
        </CategoryPanel>
      )}

      {panel === "zip" && (
        <CategoryPanel icon="ph-map-pin" title="Find by ZIP" description="Look up prospects in any ZIP code." onClose={close}>
          <ZipSearch apiKey={zipApiKey} />
        </CategoryPanel>
      )}

      {panel === "leaders" && (
        <CategoryPanel icon="ph-trophy" title="Team Leaderboard" description="How the team is tracking this period." onClose={close}>
          <LeadersPanel initialBoard={initialBoard} />
        </CategoryPanel>
      )}
    </div>
  );
}

function Card({
  icon, title, description, number, numberLabel, status, fill, dark, onClick,
}: {
  icon: string; title: string; description: string; number: number; numberLabel: string;
  status: string; fill: string; dark?: boolean; onClick: () => void;
}) {
  const color = dark ? "var(--bg)" : "var(--text)";
  const muted = dark ? "color-mix(in srgb, var(--bg) 80%, transparent)" : "var(--neutral-700)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left",
        cursor: "pointer",
        border: "none",
        minHeight: 168,
        padding: 22,
        borderRadius: "var(--radius-sm)",
        background: fill,
        color,
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        font: "inherit",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 28, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
            <i className={`ph-duotone ${icon}`} style={{ fontSize: 28 }} />
            {title}
          </span>
          <span style={{ fontSize: 16, color: muted }}>{description}</span>
        </div>
        <div style={{ textAlign: "right", flex: "none" }}>
          <div style={{ fontSize: 48, fontWeight: 600, lineHeight: 1 }}>{number}</div>
          <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: muted }}>{numberLabel}</div>
        </div>
      </div>
      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600, color: muted }}>
        <span>{status}</span>
        <i className="ph-duotone ph-arrow-right" style={{ fontSize: 16 }} />
      </div>
    </button>
  );
}

const NAV_ITEM: React.CSSProperties = {
  width: 86,
  height: 56,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
  borderRadius: "var(--radius-sm)",
  textDecoration: "none",
  color: "var(--neutral-800)",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  font: "inherit",
};

function NavButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={NAV_ITEM}>
      <i className={`ph-duotone ${icon}`} style={{ fontSize: 24, color: "var(--accent-500)" }} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  );
}

function NavLink({ icon, label, href }: { icon: string; label: string; href: string }) {
  return (
    <Link href={href} style={NAV_ITEM}>
      <i className={`ph-duotone ${icon}`} style={{ fontSize: 24, color: "var(--accent-500)" }} />
      <span style={{ fontSize: 12 }}>{label}</span>
    </Link>
  );
}
