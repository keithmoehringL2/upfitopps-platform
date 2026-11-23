"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createManufacturerAction, addManufacturerUserAction, setAssignmentRepAction } from "@/lib/admin/actions";

type Role = "mfr_regional" | "mfr_leadership";
interface Manufacturer {
  id: string;
  name: string;
  status: string;
  users: { id: string; name: string | null; email: string; role: string }[];
  regionals: { id: string; name: string | null; email: string }[];
  assignments: { pdId: string; distributorName: string; cohort: string | null; programName: string; regionalRepUserId: string | null }[];
}

const emailOk = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());

export function ManufacturersManager({ manufacturers }: { manufacturers: Manufacturer[] }) {
  const router = useRouter();
  const [busy, startBusy] = useTransition();
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [forms, setForms] = useState<Record<string, { name: string; email: string; role: Role }>>({});

  const formFor = (id: string) => forms[id] ?? { name: "", email: "", role: "mfr_regional" as Role };
  const setForm = (id: string, patch: Partial<{ name: string; email: string; role: Role }>) =>
    setForms((f) => ({ ...f, [id]: { ...formFor(id), ...patch } }));

  function addManufacturer() {
    const name = newName.trim();
    if (!name) return;
    startBusy(async () => {
      const res = await createManufacturerAction(name);
      if (res.ok) { setNewName(""); setNote(`${name} added · its data stays separate from other manufacturers.`); router.refresh(); }
      else setNote(res.error);
    });
  }
  function addUser(mId: string, mName: string) {
    const f = formFor(mId);
    if (!f.name.trim() || !emailOk(f.email)) { setNote("Enter a name and a valid email."); return; }
    startBusy(async () => {
      const res = await addManufacturerUserAction(mId, { name: f.name, email: f.email, role: f.role });
      if (res.ok) { setForms((fs) => ({ ...fs, [mId]: { name: "", email: "", role: "mfr_regional" } })); setNote(`${f.name} invited to the ${mName} portal.`); router.refresh(); }
      else setNote(res.error);
    });
  }
  function setRep(pdId: string, regionalRepUserId: string, distributorName: string, regionals: Manufacturer["regionals"]) {
    startBusy(async () => {
      const res = await setAssignmentRepAction(pdId, regionalRepUserId || null);
      if (res.ok) {
        const rep = regionals.find((r) => r.id === regionalRepUserId);
        setNote(`${distributorName} assigned to ${rep ? (rep.name ?? rep.email) : "no regional rep"} · manufacturer access updated.`);
        router.refresh();
      } else setNote(res.error);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--neutral-700)" }}>Each manufacturer sees only its own program data</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 34, fontWeight: 600 }}>Manufacturers</h1>
        </div>
        <div className="field" style={{ gap: 4 }}>
          <label>New manufacturer</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Manufacturer name" style={{ minHeight: 44, width: 240 }} />
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} disabled={busy || !newName.trim()} onClick={addManufacturer}>
              <i className="ph-duotone ph-plus" /><span>Add</span>
            </button>
          </div>
        </div>
      </div>

      {note && <div style={{ fontSize: 14, color: "var(--accent-700)" }}>{note}</div>}

      {manufacturers.length === 0 && <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No manufacturers yet.</p>}

      {manufacturers.map((m) => {
        const f = formFor(m.id);
        return (
          <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8, borderTop: "1px solid var(--divider)" }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: "var(--accent-700)", display: "flex", alignItems: "center", gap: 10 }}>
              <i className="ph-duotone ph-factory" /> {m.name}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1.4fr)", gap: 40 }}>
              {/* Portal users */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Portal users</h4>
                {m.users.length === 0 ? (
                  <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No users yet.</p>
                ) : (
                  m.users.map((u) => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{u.name ?? u.email}</span>
                        <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{u.email}</span>
                      </div>
                      <span className={`tag ${u.role === "mfr_leadership" ? "tag-accent" : "tag-neutral"}`} style={{ marginLeft: "auto" }}>
                        {u.role === "mfr_leadership" ? "Leadership" : "Regional rep"}
                      </span>
                    </div>
                  ))
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <input className="input" value={f.name} onChange={(e) => setForm(m.id, { name: e.target.value })} placeholder="Name" style={{ minHeight: 40 }} />
                  <input className="input" value={f.email} onChange={(e) => setForm(m.id, { email: e.target.value })} placeholder="name@company.com" style={{ minHeight: 40 }} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <select className="input" value={f.role} onChange={(e) => setForm(m.id, { role: e.target.value as Role })} style={{ minHeight: 40, flex: 1 }}>
                    <option value="mfr_regional">Regional rep</option>
                    <option value="mfr_leadership">Leadership</option>
                  </select>
                  <button type="button" className="btn btn-secondary" style={{ minHeight: 40 }} disabled={busy || !f.name.trim() || !emailOk(f.email)} onClick={() => addUser(m.id, m.name)}>
                    <i className="ph-duotone ph-user-plus" /><span>Add user</span>
                  </button>
                </div>
                <p style={{ fontSize: 12, color: "var(--neutral-700)", margin: 0 }}>
                  Leadership sees every distributor in this manufacturer’s programs. Regional reps see only the programs assigned to them. (Portal sign-in is a later phase.)
                </p>
              </div>

              {/* Program assignments */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Program assignments</h4>
                {m.assignments.length === 0 ? (
                  <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No distributors in this program yet. Add the program from a distributor’s Programs tab.</p>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table className="table" style={{ minWidth: 460 }}>
                      <thead><tr><th>Distributor</th><th>Cohort</th><th>Regional rep</th></tr></thead>
                      <tbody>
                        {m.assignments.map((a) => (
                          <tr key={a.pdId}>
                            <td style={{ fontWeight: 600 }}>{a.distributorName}</td>
                            <td style={{ fontSize: 13, color: "var(--neutral-700)" }}>{a.cohort ?? "—"}</td>
                            <td>
                              <select className="input" value={a.regionalRepUserId ?? ""} disabled={busy} onChange={(e) => setRep(a.pdId, e.target.value, a.distributorName, m.regionals)} style={{ minHeight: 38, minWidth: 180 }}>
                                <option value="">Unassigned</option>
                                {m.regionals.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.email}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
