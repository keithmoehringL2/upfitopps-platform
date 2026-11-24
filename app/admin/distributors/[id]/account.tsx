"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  StepBranding,
  StepPrograms,
  emailOk,
  type CatalogProgram,
  type ProgDraft,
} from "../new/wizard";
import { uploadLogoAction, saveAccountAction, updateStatusAction, rollbackImportAction, deleteDistributorAction } from "@/lib/admin/actions";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "upfitoutreach.com";

type Status = "onboarding" | "active" | "paused" | "disabled";

interface AccountData {
  distributor: { id: string; name: string; slug: string; status: Status; primaryColor: string; secondaryColor: string | null; logoUrl: string | null };
  manager: { id: string; name: string | null; email: string } | null;
  reps: { id: string; name: string | null; email: string; dailyTarget: number | null; status: Status }[];
  assignments: { programId: string; cohort: string | null; regionalRepUserId: string | null }[];
  catalog: CatalogProgram[];
  imports: { id: string; filename: string; counts: { rows: number; created: number; updated: number; skipped: number }; status: "committed" | "rolled_back"; createdAt: string | Date; by: string }[];
  stats: { companyCount: number; repCount: number; programCount: number; lastImport: string | Date | null };
  audit: { action: string; createdAt: string | Date; actor: string }[];
}

type RepRow = { id?: string; name: string; email: string; target: number; status: "active" | "paused" | "disabled" };

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "branding", label: "Branding" },
  { key: "users", label: "Users" },
  { key: "programs", label: "Programs" },
  { key: "imports", label: "Imports" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const STATUS_TAG: Record<Status, { label: string; cls: string }> = {
  onboarding: { label: "Onboarding", cls: "tag-outline" },
  active: { label: "Active", cls: "tag-accent" },
  paused: { label: "Paused", cls: "tag-neutral" },
  disabled: { label: "Disabled", cls: "tag-outline" },
};

const ACTION_LABEL: Record<string, string> = {
  "distributor.created": "Account created",
  "distributor.updated": "Account updated",
  "distributor.status_changed": "Status changed",
  "import.committed": "CSV import committed",
  "import.rolled_back": "CSV import rolled back",
};

export function DistributorAccount({ account }: { account: AccountData }) {
  const router = useRouter();
  const d = account.distributor;

  const [tab, setTab] = useState<Tab>("overview");
  const [status, setStatus] = useState<Status>(d.status);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  // Editable draft (branding + users + programs), saved together via the bar.
  const [color, setColor] = useState(d.primaryColor);
  const [color2, setColor2] = useState(d.secondaryColor ?? "#fc4c02");
  const [logo, setLogo] = useState<string | null>(d.logoUrl);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");
  const [mgr, setMgr] = useState({ name: account.manager?.name ?? "", email: account.manager?.email ?? "" });
  const [reps, setReps] = useState<RepRow[]>(
    account.reps.map((r) => ({ id: r.id, name: r.name ?? "", email: r.email, target: r.dailyTarget ?? 10, status: r.status === "disabled" ? "disabled" : (r.status as RepRow["status"]) })),
  );
  const [progs, setProgs] = useState<Record<string, ProgDraft>>(() =>
    Object.fromEntries(
      account.catalog.map((p) => {
        const a = account.assignments.find((x) => x.programId === p.id);
        return [p.id, { on: !!a, cohort: a?.cohort ?? "Fall 2026 cohort", regionalRepUserId: a?.regionalRepUserId ?? "" }];
      }),
    ),
  );

  const snapshot = useMemo(
    () => JSON.stringify({ color, color2, logo, mgr, reps, progs }),
    [color, color2, logo, mgr, reps, progs],
  );
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;

  async function onLogo(file: File | null) {
    if (!file) return;
    setLogoBusy(true); setLogoError("");
    const fd = new FormData(); fd.set("file", file);
    const res = await uploadLogoAction(fd);
    setLogoBusy(false);
    if ("url" in res) setLogo(res.url); else setLogoError(res.error);
  }

  async function changeStatus(next: Status) {
    setStatus(next); setStatusBusy(true); setNote("");
    const res = await updateStatusAction(d.id, next);
    setStatusBusy(false);
    if (res.ok) { setNote(`${d.name} is now ${STATUS_TAG[next].label}.`); router.refresh(); }
    else { setStatus(d.status); setNote(res.error); }
  }

  async function save() {
    setSaving(true); setNote("");
    const res = await saveAccountAction(d.id, {
      primaryColor: color,
      secondaryColor: color2,
      logoUrl: logo,
      manager: account.manager ? { id: account.manager.id, name: mgr.name, email: mgr.email } : null,
      reps: reps.map((r) => ({ id: r.id, name: r.name, email: r.email, dailyTarget: r.target, status: r.status })),
      programs: account.catalog.filter((p) => progs[p.id]?.on).map((p) => ({ programId: p.id, cohort: progs[p.id].cohort, regionalRepUserId: progs[p.id].regionalRepUserId || null })),
    });
    setSaving(false);
    if (res.ok) { setBaseline(snapshot); setNote("Saved · logged to the audit trail."); router.refresh(); }
    else setNote(res.error);
  }

  function discard() {
    setColor(d.primaryColor); setColor2(d.secondaryColor ?? "#fc4c02"); setLogo(d.logoUrl);
    setMgr({ name: account.manager?.name ?? "", email: account.manager?.email ?? "" });
    setReps(account.reps.map((r) => ({ id: r.id, name: r.name ?? "", email: r.email, target: r.dailyTarget ?? 10, status: (r.status === "disabled" ? "disabled" : r.status) as RepRow["status"] })));
    setProgs(Object.fromEntries(account.catalog.map((p) => { const a = account.assignments.find((x) => x.programId === p.id); return [p.id, { on: !!a, cohort: a?.cohort ?? "Fall 2026 cohort", regionalRepUserId: a?.regionalRepUserId ?? "" }]; })));
    setNote("");
  }

  const tag = STATUS_TAG[status];
  const showSaveBar = tab === "branding" || tab === "users" || tab === "programs";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" /><span>Distributors</span>
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span aria-hidden style={{ width: 56, height: 56, borderRadius: 12, flex: "none", background: logo ? `center/contain no-repeat ${d.primaryColor}` : d.primaryColor, color: "#fff", display: "grid", placeItems: "center", fontSize: 24, fontWeight: 600 }}>
          {!logo && d.name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600 }}>{d.name}</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <a href={`https://${d.slug}.${ROOT}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: "var(--neutral-700)" }}>{d.slug}.{ROOT}</a>
            <span className={`tag ${tag.cls}`}>{tag.label}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 24, borderBottom: "1px solid var(--divider)" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 16,
            padding: "6px 0 10px", color: tab === t.key ? "var(--accent-700)" : "var(--text)",
            boxShadow: tab === t.key ? "inset 0 -2px 0 var(--accent-500)" : "none", fontWeight: tab === t.key ? 600 : 400,
          }}>{t.label}</button>
        ))}
      </div>

      {note && <div style={{ fontSize: 14, color: "var(--accent-700)" }}>{note}</div>}

      {tab === "overview" && (
        <Overview account={account} status={status} statusBusy={statusBusy} onStatus={changeStatus} />
      )}
      {tab === "branding" && (
        <StepBranding name={d.name} color={color} setColor={setColor} color2={color2} setColor2={setColor2}
          logoUrl={logo} logoBusy={logoBusy} logoError={logoError} onLogo={onLogo} onRemoveLogo={() => setLogo(null)} />
      )}
      {tab === "users" && <UsersEditor mgr={mgr} setMgr={setMgr} reps={reps} setReps={setReps} />}
      {tab === "programs" && <StepPrograms catalog={account.catalog} progs={progs} setProgs={setProgs} />}
      {tab === "imports" && <ImportsTab id={d.id} imports={account.imports} />}

      {showSaveBar && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "flex-end", paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
          <span style={{ fontSize: 13, color: "var(--neutral-700)", marginRight: "auto" }}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={!dirty || saving} onClick={discard}>Discard</button>
          <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}

function Overview({ account, status, statusBusy, onStatus }: {
  account: AccountData; status: Status; statusBusy: boolean; onStatus: (s: Status) => void;
}) {
  const lastImport = account.stats.lastImport
    ? new Date(account.stats.lastImport).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "—";
  const tiles = [
    { label: "Companies", value: account.stats.companyCount.toLocaleString(), sub: "In the repository" },
    { label: "Sales reps", value: String(account.stats.repCount), sub: account.manager ? `Manager: ${account.manager.name ?? account.manager.email}` : "No manager" },
    { label: "Programs", value: String(account.stats.programCount), sub: account.assignments.length ? "Assigned" : "None yet" },
    { label: "Last import", value: lastImport, sub: account.imports.length ? `${account.imports.length} total` : "No imports yet" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 20, maxWidth: 820 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{t.label}</span>
            <span style={{ fontSize: 40, fontWeight: 600, lineHeight: 1 }}>{t.value}</span>
            <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{t.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 520 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Account status</h4>
        <div className="seg" style={{ alignSelf: "flex-start", opacity: statusBusy ? 0.6 : 1 }}>
          {(["onboarding", "active", "paused"] as Status[]).map((s) => (
            <label key={s} className="seg-opt" style={{ padding: "9px 16px", fontSize: 14 }}>
              <input type="radio" name="accstatus" checked={status === s} onChange={() => onStatus(s)} disabled={statusBusy} />
              {STATUS_TAG[s].label}
            </label>
          ))}
        </div>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Paused accounts keep their data. Reps stop receiving emails and can’t sign in.</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 620 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Recent audit log</h4>
        {account.audit.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No activity yet.</p>
        ) : (
          account.audit.map((a, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}>
              <span style={{ fontSize: 15 }}>{ACTION_LABEL[a.action] ?? a.action}</span>
              <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>
                {new Date(a.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {a.actor}
              </span>
            </div>
          ))
        )}
      </div>

      <DangerZone
        id={account.distributor.id}
        name={account.distributor.name}
        repCount={account.stats.repCount}
        companyCount={account.stats.companyCount}
      />
    </div>
  );
}

function DangerZone({ id, name, repCount, companyCount }: {
  id: string; name: string; repCount: number; companyCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const impact = `its ${repCount} rep${repCount === 1 ? "" : "s"}, ${companyCount.toLocaleString()} compan${companyCount === 1 ? "y" : "ies"}`;

  async function del() {
    setBusy(true); setErr("");
    const res = await deleteDistributorAction(id);
    if (res.ok) { router.push("/"); router.refresh(); }
    else { setErr(res.error); setBusy(false); }
  }

  return (
    <section style={{ marginTop: 12, padding: 20, borderRadius: "var(--radius-lg)", border: "1px solid var(--color-accent-2-500)", maxWidth: 620, display: "flex", flexDirection: "column", gap: 8 }}>
      <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--color-accent-2-700)" }}>Danger zone</h4>
      <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: 0 }}>
        Permanently delete this distributor, {impact}, and all related records (interactions, imports, history). This cannot be undone.
      </p>
      <button type="button" className="btn" style={{ alignSelf: "flex-start", minHeight: 44, color: "var(--bg)", background: "var(--color-accent-2-500)" }} onClick={() => { setOpen(true); setTyped(""); setErr(""); }}>
        <i className="ph-duotone ph-trash" /><span>Delete distributor</span>
      </button>

      {open && (
        <div onClick={() => !busy && setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50, background: "color-mix(in srgb, var(--text) 45%, transparent)", display: "grid", placeItems: "center", padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--bg)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Delete {name}?</h3>
            <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: 0 }}>
              This permanently removes <strong>{name}</strong>, {impact}, and every related record. <strong>This cannot be undone.</strong>
            </p>
            <div className="field">
              <label>Type <strong>{name}</strong> to confirm</label>
              <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoFocus style={{ minHeight: 44 }} />
            </div>
            {err && <p style={{ fontSize: 13, color: "var(--color-accent-2-700)", margin: 0 }}>{err}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn" style={{ minHeight: 44, color: "var(--bg)", background: "var(--color-accent-2-500)", opacity: typed.trim() !== name || busy ? 0.5 : 1 }} disabled={typed.trim() !== name || busy} onClick={del}>
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function UsersEditor({ mgr, setMgr, reps, setReps }: {
  mgr: { name: string; email: string }; setMgr: (v: { name: string; email: string }) => void;
  reps: RepRow[]; setReps: React.Dispatch<React.SetStateAction<RepRow[]>>;
}) {
  const setRep = (i: number, patch: Partial<RepRow>) => setReps((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRep = (i: number) => setReps((rs) => {
    const r = rs[i];
    if (r.id) return rs.map((x, j) => (j === i ? { ...x, status: "disabled" } : x)); // soft-disable existing
    return rs.filter((_, j) => j !== i); // drop unsaved
  });
  const visible = reps.map((r, i) => ({ r, i })).filter(({ r }) => r.status !== "disabled");
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Distributor manager</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field"><label>Name</label><input className="input" value={mgr.name} onChange={(e) => setMgr({ ...mgr, name: e.target.value })} style={{ minHeight: 44 }} /></div>
          <div className="field"><label>Email</label><input className="input" value={mgr.email} onChange={(e) => setMgr({ ...mgr, email: e.target.value })} style={{ minHeight: 44 }} /></div>
        </div>
        {mgr.email && !emailOk(mgr.email) && <span style={{ fontSize: 12, color: "var(--color-accent-2-700, #aa0b56)" }}>Enter a valid email.</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sales reps</h4>
        {visible.map(({ r, i }) => (
          <div key={r.id ?? `new-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 110px 40px", gap: 10, alignItems: "center" }}>
            <input className="input" value={r.name} onChange={(e) => setRep(i, { name: e.target.value })} placeholder="Name" style={{ minHeight: 42 }} />
            <input className="input" value={r.email} onChange={(e) => setRep(i, { email: e.target.value })} placeholder="name@company.com" style={{ minHeight: 42 }} />
            <input className="input" type="number" min={1} value={r.target} onChange={(e) => setRep(i, { target: Math.max(1, parseInt(e.target.value) || 1) })} style={{ minHeight: 42, textAlign: "right" }} />
            <button type="button" className="btn btn-ghost" aria-label="Remove rep" title="Remove" onClick={() => removeRep(i)} style={{ color: "var(--color-accent-2-700, #aa0b56)" }}><i className="ph-duotone ph-trash" /></button>
          </div>
        ))}
        {visible.length === 0 && <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No active reps.</p>}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setReps((rs) => [...rs, { name: "", email: "", target: 10, status: "active" }])}>
          <i className="ph-duotone ph-plus" /><span>Add rep</span>
        </button>
      </div>
    </div>
  );
}

function ImportsTab({ id, imports }: { id: string; imports: AccountData["imports"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function doRollback(batchId: string) {
    setBusy(batchId); setNote("");
    const res = await rollbackImportAction(batchId, id);
    setBusy(null);
    if (res.ok) { setNote("Import rolled back."); router.refresh(); }
    else setNote(res.error);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: "var(--accent-700)", fontSize: 22, fontWeight: 600 }}>CSV imports</h3>
          <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "4px 0 0" }}>Prepared company files from L2’s data team. Each import adds new companies and updates matching ones.</p>
        </div>
        <Link href={`/distributors/${id}/import`} className="btn btn-primary" style={{ minHeight: 44 }}>
          <i className="ph-duotone ph-file-csv" /><span>New CSV import</span>
        </Link>
      </div>
      {note && <div style={{ fontSize: 14, color: "var(--accent-700)" }}>{note}</div>}
      {imports.length === 0 ? (
        <div style={{ padding: "20px 0" }}>
          <p style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>No companies yet</p>
          <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "4px 0 0" }}>
            Import the prepared CSV to load this distributor’s companies. Nothing appears in rep queues until companies are assigned.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead><tr><th>Import</th><th>File</th><th style={{ textAlign: "right" }}>Created</th><th style={{ textAlign: "right" }}>Updated</th><th style={{ textAlign: "right" }}>Skipped</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {imports.map((im) => (
                <tr key={im.id}>
                  <td style={{ fontSize: 13, color: "var(--neutral-700)" }}>{new Date(im.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}<div style={{ fontSize: 12 }}>by {im.by}</div></td>
                  <td style={{ fontFamily: "monospace", fontSize: 13 }}>{im.filename}</td>
                  <td style={{ textAlign: "right" }}>{im.counts.created}</td>
                  <td style={{ textAlign: "right" }}>{im.counts.updated}</td>
                  <td style={{ textAlign: "right" }}>{im.counts.skipped}</td>
                  <td><span className={`tag ${im.status === "committed" ? "tag-accent" : "tag-neutral"}`}>{im.status === "committed" ? "Committed" : "Rolled back"}</span></td>
                  <td>
                    {im.status === "committed" && (
                      <button type="button" className="btn btn-ghost" style={{ fontSize: 13, color: "var(--color-accent-2-700, #aa0b56)" }} disabled={busy === im.id} onClick={() => doRollback(im.id)}>
                        {busy === im.id ? "Rolling back…" : "Roll back"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
