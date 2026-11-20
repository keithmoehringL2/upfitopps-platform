"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reassignRep,
  revokeSessions,
  saveSettingsAction,
} from "@/lib/manager/actions";
import {
  CADENCE_ROWS,
  DAYS,
  SEND_TIMES,
  STARTER_LENGTHS,
  SUMMARY_DAYS,
  SUMMARY_TIMES,
  type ManagerSettings,
} from "@/lib/manager/settings";

export interface EditRep {
  id: string;
  email: string;
  dailyTarget: number;
  status: "active" | "paused" | "disabled";
  dailyEmailEnabled: boolean;
  companyCount: number;
  lastActive: string | null;
  isNew?: boolean;
}

type SectionKey = "team" | "outreach" | "email" | "report" | "lb";
const SECTIONS: { key: SectionKey; label: string; icon: string }[] = [
  { key: "team", label: "Sales team", icon: "ph-users-three" },
  { key: "outreach", label: "Outreach cadence", icon: "ph-calendar-dots" },
  { key: "email", label: "Rep daily email", icon: "ph-envelope-simple" },
  { key: "report", label: "Manager summary", icon: "ph-chart-line-up" },
  { key: "lb", label: "Leaderboard", icon: "ph-trophy" },
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const serialize = (reps: EditRep[], s: ManagerSettings) =>
  JSON.stringify({
    reps: reps.map((r) => ({ id: r.id, email: r.email, dailyTarget: r.dailyTarget, status: r.status, dailyEmailEnabled: r.dailyEmailEnabled, isNew: !!r.isNew })),
    settings: s,
  });

const H2: React.CSSProperties = { margin: 0, fontSize: 25, fontWeight: 600 };
const H4: React.CSSProperties = { margin: 0, fontSize: 17, fontWeight: 600 };
const SUB: React.CSSProperties = { fontSize: 15, color: "var(--neutral-800)" };

export function SettingsPanels({ team, settings }: { team: EditRep[]; settings: ManagerSettings }) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [acting, startAct] = useTransition();

  const [reps, setReps] = useState<EditRep[]>(team);
  const [cfg, setCfg] = useState<ManagerSettings>(settings);
  const [section, setSection] = useState<SectionKey>("team");
  const [baseline, setBaseline] = useState(() => serialize(team, settings));
  const [note, setNote] = useState("");

  const [newRep, setNewRep] = useState({ email: "", target: 10 });
  const [newRecipient, setNewRecipient] = useState("");
  const [reassign, setReassign] = useState({ from: team[0]?.id ?? "", to: "" });

  const dirty = useMemo(() => serialize(reps, cfg) !== baseline, [reps, cfg, baseline]);

  // helpers
  const setRep = (id: string, patch: Partial<EditRep>) =>
    setReps((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const set = <K extends keyof ManagerSettings>(k: K, v: ManagerSettings[K]) =>
    setCfg((c) => ({ ...c, [k]: v }));

  function save() {
    setNote("");
    const payload = {
      reps: reps.filter((r) => !r.isNew).map((r) => ({ id: r.id, dailyTarget: Math.max(1, r.dailyTarget || 1), status: r.status, dailyEmailEnabled: r.dailyEmailEnabled })),
      newReps: reps.filter((r) => r.isNew).map((r) => ({ email: r.email, dailyTarget: Math.max(1, r.dailyTarget || 1) })),
      settings: cfg,
    };
    startSave(async () => {
      const res = await saveSettingsAction(payload);
      if (!res.ok) setNote(res.error);
      else {
        const freshReps: EditRep[] = res.team.map((r) => ({
          id: r.id,
          email: r.email,
          dailyTarget: r.dailyTarget ?? 10,
          status: r.status as EditRep["status"],
          dailyEmailEnabled: r.dailyEmailEnabled,
          companyCount: r.companyCount,
          lastActive: r.lastActive ? new Date(r.lastActive).toISOString().slice(0, 10) : null,
        }));
        setReps(freshReps);
        setCfg(res.settings);
        setBaseline(serialize(freshReps, res.settings));
        setNote("Settings saved · applies to future scheduling and emails.");
        router.refresh();
      }
    });
  }
  function discard() {
    const b = JSON.parse(baseline) as { reps: EditRep[]; settings: ManagerSettings };
    // keep server-only fields (companyCount/lastActive) from current rows
    setReps((cur) =>
      b.reps.map((br) => {
        const match = cur.find((c) => c.id === br.id);
        return { ...(match ?? ({} as EditRep)), ...br } as EditRep;
      }),
    );
    setCfg(clone(b.settings));
    setNote("");
  }

  function doReassign() {
    const { from, to } = reassign;
    if (!from || from === to) return;
    startAct(async () => {
      const res = await reassignRep(from, to || null);
      if (res.error) setNote(res.error);
      else {
        const n = res.changed ?? 0;
        setReps((rs) => rs.map((r) => (r.id === from ? { ...r, companyCount: Math.max(0, r.companyCount - n) } : r.id === to ? { ...r, companyCount: r.companyCount + n } : r)));
        setNote(`Moved ${n} ${n === 1 ? "company" : "companies"}.`);
      }
    });
  }
  function doRevoke(id: string, email: string) {
    startAct(async () => {
      const res = await revokeSessions(id);
      setNote(res.error ?? `${email}'s sessions revoked.`);
    });
  }
  function addRep() {
    const email = newRep.email.trim().toLowerCase();
    if (!email.includes("@")) {
      setNote("Enter a valid email for the new rep.");
      return;
    }
    setReps((rs) => [
      ...rs,
      { id: `new-${Date.now()}`, email, dailyTarget: Math.max(1, newRep.target || 10), status: "active", dailyEmailEnabled: true, companyCount: 0, lastActive: null, isNew: true },
    ]);
    setNewRep({ email: "", target: 10 });
    setNote("Rep added — save changes to send the invite.");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Settings</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{dirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" onClick={discard} disabled={!dirty || saving} className="btn btn-secondary" style={{ minHeight: 44 }}>Discard</button>
          <button type="button" onClick={save} disabled={!dirty || saving} className="btn btn-primary" style={{ minHeight: 44 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {note && <div style={{ fontSize: 14, color: "var(--accent-700)" }}>{note}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr)", gap: 48, alignItems: "start" }}>
        {/* Sidebar */}
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 24 }}>
          {SECTIONS.map((s) => {
            const active = section === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: "var(--radius-md)", fontSize: 16, fontFamily: "inherit", textAlign: "left",
                  border: "none", cursor: "pointer",
                  color: active ? "var(--accent-700)" : "var(--text)",
                  fontWeight: active ? 600 : 400,
                  background: active ? "var(--accent-100)" : "transparent",
                }}
              >
                <i className={`ph-duotone ${s.icon}`} style={{ fontSize: 20 }} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div style={{ minWidth: 0 }}>
          {section === "team" && (
            <TeamSection
              reps={reps}
              setRep={setRep}
              newRep={newRep}
              setNewRep={setNewRep}
              addRep={addRep}
              reassign={reassign}
              setReassign={setReassign}
              doReassign={doReassign}
              doRevoke={doRevoke}
              busy={acting}
            />
          )}
          {section === "outreach" && <OutreachSection cfg={cfg} setCfg={setCfg} />}
          {section === "email" && <EmailSection cfg={cfg} set={set} />}
          {section === "report" && (
            <ReportSection cfg={cfg} set={set} newRecipient={newRecipient} setNewRecipient={setNewRecipient} />
          )}
          {section === "lb" && <LeaderboardSection cfg={cfg} set={set} />}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── sections ─────────────────────────────── */

function TeamSection({
  reps, setRep, newRep, setNewRep, addRep, reassign, setReassign, doReassign, doRevoke, busy,
}: {
  reps: EditRep[];
  setRep: (id: string, patch: Partial<EditRep>) => void;
  newRep: { email: string; target: number };
  setNewRep: (v: { email: string; target: number }) => void;
  addRep: () => void;
  reassign: { from: string; to: string };
  setReassign: (v: { from: string; to: string }) => void;
  doReassign: () => void;
  doRevoke: (id: string, email: string) => void;
  busy: boolean;
}) {
  const fromCount = reps.find((r) => r.id === reassign.from)?.companyCount ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Sales team</h2>
        <span style={SUB}>Reps sign in from their daily email. Targets are recommendations, not call limits.</span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 15, minWidth: 820 }}>
          <thead>
            <tr>
              <th>Rep</th><th>Daily target</th><th>Daily email</th><th>Status</th>
              <th style={{ textAlign: "right" }}>Companies</th><th>Last active</th><th></th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 600 }}>
                  {r.email}
                  {r.isNew && <span className="tag tag-outline" style={{ marginLeft: 8 }}>New</span>}
                </td>
                <td>
                  <input className="input" type="number" min={1} value={r.dailyTarget}
                    onChange={(e) => setRep(r.id, { dailyTarget: parseInt(e.target.value) || 0 })}
                    style={{ width: 80, minHeight: 38 }} />
                </td>
                <td>
                  <input type="checkbox" checked={r.dailyEmailEnabled}
                    onChange={(e) => setRep(r.id, { dailyEmailEnabled: e.target.checked })}
                    style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
                </td>
                <td>
                  <select className="input" value={r.status}
                    onChange={(e) => setRep(r.id, { status: e.target.value as EditRep["status"] })}
                    style={{ width: 130, minHeight: 38 }}>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </td>
                <td style={{ textAlign: "right" }}>{r.companyCount}</td>
                <td style={{ fontSize: 14, color: "var(--neutral-800)" }}>{r.isNew ? "Invite pending" : r.lastActive ?? "—"}</td>
                <td>
                  {!r.isNew && (
                    <button type="button" disabled={busy} onClick={() => doRevoke(r.id, r.email)} className="btn btn-ghost" style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      Revoke sessions
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h4 style={H4}>Add a sales rep</h4>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" value={newRep.email} onChange={(e) => setNewRep({ ...newRep, email: e.target.value })} placeholder="name@company.com" style={{ minHeight: 44, width: 260 }} />
          </div>
          <div className="field">
            <label>Daily target</label>
            <input className="input" type="number" min={1} value={newRep.target} onChange={(e) => setNewRep({ ...newRep, target: parseInt(e.target.value) || 0 })} style={{ minHeight: 44, width: 110 }} />
          </div>
          <button type="button" onClick={addRep} className="btn btn-primary" style={{ minHeight: 44 }}>
            <i className="ph-duotone ph-user-plus" /><span>Add and invite</span>
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h4 style={H4}>Reassign a departing rep&rsquo;s companies</h4>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="field">
            <label>From</label>
            <select className="input" value={reassign.from} onChange={(e) => setReassign({ ...reassign, from: e.target.value })} style={{ width: 240, minHeight: 44 }}>
              {reps.filter((r) => !r.isNew).map((r) => (<option key={r.id} value={r.id}>{r.email}</option>))}
            </select>
          </div>
          <div className="field">
            <label>To</label>
            <select className="input" value={reassign.to} onChange={(e) => setReassign({ ...reassign, to: e.target.value })} style={{ width: 240, minHeight: 44 }}>
              <option value="">Unassigned</option>
              {reps.filter((r) => !r.isNew && r.id !== reassign.from && r.status !== "disabled").map((r) => (<option key={r.id} value={r.id}>{r.email}</option>))}
            </select>
          </div>
          <button type="button" disabled={busy || !reassign.from || reassign.from === reassign.to} onClick={doReassign} className="btn btn-secondary" style={{ minHeight: 44 }}>
            Move {fromCount} {fromCount === 1 ? "company" : "companies"}
          </button>
        </div>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Applies immediately. History is kept.</span>
      </div>
    </div>
  );
}

function OutreachSection({ cfg, setCfg }: { cfg: ManagerSettings; setCfg: React.Dispatch<React.SetStateAction<ManagerSettings>> }) {
  const setCad = (key: string, v: number | null) =>
    setCfg((c) => ({ ...c, cadence: { ...c.cadence, [key]: v } }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Outreach cadence</h2>
        <span style={SUB}>How long a company waits before it&rsquo;s eligible again after each outcome. Applies to future scheduling only. A date a prospect asks for always wins.</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {CADENCE_ROWS.map((row) => {
          const v = cfg.cadence[row.key];
          const none = v == null;
          return (
            <div key={row.key} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 40px 110px", gap: 12, alignItems: "center", padding: "8px 0" }}>
              <span style={{ fontSize: 16 }}>{row.label}</span>
              <input className="input" type="number" min={1} value={none ? "" : v} disabled={none} placeholder="—"
                onChange={(e) => setCad(row.key, parseInt(e.target.value) || 1)}
                style={{ minHeight: 40, textAlign: "right" }} />
              <span style={{ fontSize: 14, color: "var(--neutral-700)", opacity: none ? 0.4 : 1 }}>days</span>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={none} onChange={(e) => setCad(row.key, e.target.checked ? null : 7)} style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
                None
              </label>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h4 style={H4}>Existing-customer reminders</h4>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 40px", gap: 12, alignItems: "center", maxWidth: 420 }}>
          <span style={{ fontSize: 16 }}>Snooze length</span>
          <input className="input" type="number" min={1} value={cfg.customer.snoozeDays}
            onChange={(e) => setCfg((c) => ({ ...c, customer: { ...c.customer, snoozeDays: parseInt(e.target.value) || 1 } }))}
            style={{ minHeight: 40, textAlign: "right" }} />
          <span style={{ fontSize: 14, color: "var(--neutral-700)" }}>days</span>
        </div>
        <Toggle
          label="Show due reminders in the daily email"
          sub="Listed separately from cold prospects. Touch-base intervals come from the imported file."
          on={cfg.customer.remindersInDailyEmail}
          onToggle={() => setCfg((c) => ({ ...c, customer: { ...c.customer, remindersInDailyEmail: !c.customer.remindersInDailyEmail } }))}
        />
      </div>
    </div>
  );
}

function EmailSection({ cfg, set }: { cfg: ManagerSettings; set: <K extends keyof ManagerSettings>(k: K, v: ManagerSettings[K]) => void }) {
  const re = cfg.repEmail;
  const toggleDay = (d: string) =>
    set("repEmail", { ...re, days: re.days.includes(d) ? re.days.filter((x) => x !== d) : DAYS.filter((x) => x === d || re.days.includes(x)) });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Rep daily email</h2>
        <span style={SUB}>The morning prospect list each active rep receives. Per-rep opt-out lives under Sales team.</span>
      </div>
      <Toggle
        label="Send daily emails"
        sub={re.send ? `Sending ${re.days.join(", ")} at ${re.time}.` : "Paused for all reps. Reps can still open the app."}
        on={re.send}
        onToggle={() => set("repEmail", { ...re, send: !re.send })}
      />
      <div className="field">
        <label>Days</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAYS.map((d) => (
            <button key={d} type="button" onClick={() => toggleDay(d)} className={`btn ${re.days.includes(d) ? "btn-primary" : "btn-secondary"}`} style={{ minWidth: 56, minHeight: 44 }}>{d}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="field">
          <label>Send time</label>
          <select className="input" value={re.time} onChange={(e) => set("repEmail", { ...re, time: e.target.value })} style={{ minHeight: 44 }}>
            {SEND_TIMES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
        <div className="field">
          <label>Starter list length</label>
          <select className="input" value={re.starterLength} onChange={(e) => set("repEmail", { ...re, starterLength: parseInt(e.target.value) })} style={{ minHeight: 44 }}>
            {STARTER_LENGTHS.map((n) => (<option key={n} value={n}>{n} companies</option>))}
          </select>
        </div>
      </div>
    </div>
  );
}

function ReportSection({
  cfg, set, newRecipient, setNewRecipient,
}: {
  cfg: ManagerSettings;
  set: <K extends keyof ManagerSettings>(k: K, v: ManagerSettings[K]) => void;
  newRecipient: string;
  setNewRecipient: (v: string) => void;
}) {
  const sm = cfg.summary;
  const addRecipient = () => {
    const email = newRecipient.trim().toLowerCase();
    if (!email.includes("@") || sm.recipients.includes(email)) return;
    set("summary", { ...sm, recipients: [...sm.recipients, email] });
    setNewRecipient("");
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Manager summary email</h2>
        <span style={SUB}>Team and per-rep counts with simple conversion rates. No grades.</span>
      </div>
      <div className="field">
        <label>Frequency</label>
        <div className="seg" style={{ alignSelf: "flex-start" }}>
          <label className="seg-opt" style={{ padding: "9px 18px", fontSize: 14 }}>
            <input type="radio" name="freq" checked={sm.frequency === "daily"} onChange={() => set("summary", { ...sm, frequency: "daily" })} />Daily
          </label>
          <label className="seg-opt" style={{ padding: "9px 18px", fontSize: 14 }}>
            <input type="radio" name="freq" checked={sm.frequency === "weekly"} onChange={() => set("summary", { ...sm, frequency: "weekly" })} />Weekly
          </label>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {sm.frequency === "weekly" && (
          <div className="field">
            <label>Day</label>
            <select className="input" value={sm.day} onChange={(e) => set("summary", { ...sm, day: e.target.value })} style={{ minHeight: 44 }}>
              {SUMMARY_DAYS.map((d) => (<option key={d} value={d}>{d}</option>))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Delivery time</label>
          <select className="input" value={sm.time} onChange={(e) => set("summary", { ...sm, time: e.target.value })} style={{ minHeight: 44 }}>
            {SUMMARY_TIMES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Recipients</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sm.recipients.map((email) => (
            <div key={email} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 15, flex: 1 }}>{email}</span>
              <button type="button" onClick={() => set("summary", { ...sm, recipients: sm.recipients.filter((x) => x !== email) })} className="btn btn-ghost" style={{ fontSize: 13 }}>Remove</button>
            </div>
          ))}
          {sm.recipients.length === 0 && <span style={{ fontSize: 14, color: "var(--neutral-700)" }}>No recipients yet.</span>}
          <div style={{ display: "flex", gap: 10 }}>
            <input className="input" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} placeholder="Add an email address" style={{ minHeight: 44 }} />
            <button type="button" onClick={addRecipient} className="btn btn-secondary" style={{ minHeight: 44 }}>Add</button>
          </div>
        </div>
      </div>
      <Toggle
        label="Compare with previous period"
        sub="Adds a change figure next to each team count."
        on={sm.compareTrend}
        onToggle={() => set("summary", { ...sm, compareTrend: !sm.compareTrend })}
      />
    </div>
  );
}

function LeaderboardSection({ cfg, set }: { cfg: ManagerSettings; set: <K extends keyof ManagerSettings>(k: K, v: ManagerSettings[K]) => void }) {
  const on = cfg.leaderboard.enabled;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 620 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2 style={H2}>Team leaderboard</h2>
        <span style={SUB}>Shows at the bottom of each rep&rsquo;s mobile queue. Never included in emails.</span>
      </div>
      <Toggle
        label="Show the leaderboard to reps"
        sub={on ? "On. Reps see team rankings in their queue." : "Off. Reps see no peer metrics."}
        on={on}
        onToggle={() => set("leaderboard", { enabled: !on })}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Metrics reps see</span>
        <span style={{ fontSize: 14, lineHeight: 1.6, color: "var(--neutral-800)" }}>
          Recorded attempts, percent of target, decision-makers reached, opportunities identified and the
          opportunity conversion ratio. Default view is week to date.
        </span>
      </div>
    </div>
  );
}

function Toggle({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div onClick={onToggle} role="switch" aria-checked={on} style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 14, minHeight: 52, maxWidth: 520 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{sub}</span>
      </div>
      <div style={{ flex: "none", width: 50, height: 30, borderRadius: 15, background: on ? "var(--accent-500)" : "var(--neutral-300)", position: "relative", transition: "background .2s" }}>
        <div style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", boxShadow: "var(--shadow-sm)", transition: "left .2s" }} />
      </div>
    </div>
  );
}
