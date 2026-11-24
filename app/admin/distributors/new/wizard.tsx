"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  checkSlugAction,
  uploadLogoAction,
  createDistributorAction,
  type CreateDistributorResult,
} from "@/lib/admin/actions";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "upfitoutreach.com";
const SW1 = ["#c8102e", "#0088b0", "#1d6b3c", "#2a3f9d", "#d35400", "#2d2b2b"];
const SW2 = ["#d6006c", "#edbb00", "#7d3c98", "#e67e22", "#0088b0", "#605d5d"];
const STEPS = ["Account", "Branding", "Users", "Program", "Review"] as const;

export interface CatalogProgram {
  id: string;
  name: string;
  code: string | null;
  manufacturerName: string;
  manufacturerId: string;
  regionals: { id: string; name: string | null; email: string }[];
}
export interface ProgDraft { on: boolean; cohort: string; regionalRepUserId: string }
export interface RepDraft { name: string; email: string; target: number }

type SlugState = "empty" | "checking" | "ok" | "bad_format" | "reserved" | "taken";

export const emailOk = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());
export const hexOk = (s: string) => /^#[0-9a-fA-F]{6}$/.test(s.trim());

function slugify(name: string) {
  return name.toLowerCase().replace(/&/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 30);
}

// WCAG contrast ratio of white text on the given hex color.
function whiteContrast(hex: string): number | null {
  if (!hexOk(hex)) return null;
  const n = hex.slice(1);
  const ch = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return Math.round((1.05 / (L + 0.05)) * 10) / 10;
}

export function DistributorWizard({ catalog }: { catalog: CatalogProgram[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [created, setCreated] = useState<Extract<CreateDistributorResult, { ok: true }> | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("empty");

  const [color, setColor] = useState("#1d6b3c");
  const [color2, setColor2] = useState("#edbb00");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState("");

  const [mgr, setMgr] = useState({ name: "", email: "" });
  const [reps, setReps] = useState<RepDraft[]>([{ name: "", email: "", target: 10 }]);

  const [progs, setProgs] = useState<Record<string, ProgDraft>>(() =>
    Object.fromEntries(catalog.map((p) => [p.id, { on: false, cohort: "Fall 2026 cohort", regionalRepUserId: "" }])),
  );

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // Live slug availability (debounced).
  const slugSeq = useRef(0);
  useEffect(() => {
    const s = slug.trim();
    if (!s) { setSlugState("empty"); return; }
    setSlugState("checking");
    const seq = ++slugSeq.current;
    const t = setTimeout(async () => {
      const res = await checkSlugAction(s);
      if (seq === slugSeq.current) setSlugState(res.state);
    }, 300);
    return () => clearTimeout(t);
  }, [slug]);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }
  function onSlug(v: string) {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30));
    setSlugTouched(true);
  }

  async function onLogo(file: File | null) {
    if (!file) return;
    setLogoBusy(true); setLogoError("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await uploadLogoAction(fd);
    setLogoBusy(false);
    if ("url" in res) setLogoUrl(res.url);
    else setLogoError(res.error);
  }

  const mgrValid = mgr.name.trim() !== "" && emailOk(mgr.email);
  const repsValid = reps.filter((r) => r.name.trim() || r.email.trim()).every((r) => r.name.trim() && emailOk(r.email));
  const stepValid =
    step === 1 ? name.trim() !== "" && slugState === "ok"
    : step === 2 ? hexOk(color) && hexOk(color2)
    : step === 3 ? mgrValid && repsValid
    : true;

  async function submit() {
    setSubmitting(true); setSubmitError("");
    const res = await createDistributorAction({
      name: name.trim(),
      slug: slug.trim(),
      primaryColor: color,
      secondaryColor: color2,
      logoUrl,
      manager: { name: mgr.name.trim(), email: mgr.email.trim() },
      reps: reps.filter((r) => r.name.trim() || r.email.trim()).map((r) => ({ name: r.name, email: r.email, dailyTarget: r.target })),
      programs: catalog.filter((p) => progs[p.id]?.on).map((p) => ({
        programId: p.id,
        cohort: progs[p.id].cohort,
        regionalRepUserId: progs[p.id].regionalRepUserId || null,
      })),
    });
    setSubmitting(false);
    if (res.ok) { setCreated(res); router.refresh(); }
    else setSubmitError(res.error);
  }

  if (created) return <Created created={created} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <Link href="/" className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" /><span>Distributors</span>
      </Link>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>New distributor</h1>

      {/* Stepper */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step, active = n === step;
          return (
            <button
              key={label}
              type="button"
              onClick={() => n < step && setStep(n)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px",
                borderRadius: 999, border: "none", cursor: n < step ? "pointer" : "default",
                fontFamily: "inherit", fontSize: 14, fontWeight: active ? 600 : 400,
                background: active ? "var(--accent-100)" : "transparent", color: "var(--text)",
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
                fontSize: 13, fontWeight: 600,
                background: active || done ? "var(--accent-500)" : "var(--neutral-200)",
                color: active || done ? "#fff" : "var(--neutral-700)",
              }}>
                {done ? <i className="ph-bold ph-check" /> : n}
              </span>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ minHeight: 320 }}>
        {step === 1 && (
          <StepAccount
            name={name} onName={onName}
            slug={slug} onSlug={onSlug} slugState={slugState}
          />
        )}
        {step === 2 && (
          <StepBranding
            name={name} color={color} setColor={setColor} color2={color2} setColor2={setColor2}
            logoUrl={logoUrl} logoBusy={logoBusy} logoError={logoError} onLogo={onLogo} onRemoveLogo={() => setLogoUrl(null)}
          />
        )}
        {step === 3 && (
          <StepUsers mgr={mgr} setMgr={setMgr} reps={reps} setReps={setReps} />
        )}
        {step === 4 && (
          <StepPrograms catalog={catalog} progs={progs} setProgs={setProgs} />
        )}
        {step === 5 && (
          <StepReview
            name={name} slug={slug} color={color} color2={color2} logoUrl={logoUrl}
            mgr={mgr} reps={reps} catalog={catalog} progs={progs}
          />
        )}
      </div>

      {submitError && <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{submitError}</p>}

      {/* Footer */}
      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid var(--divider)" }}>
        {step > 1 ? (
          <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => setStep((s) => s - 1)}>Back</button>
        ) : <span />}
        {step < 5 ? (
          <button type="button" className="btn btn-primary" style={{ minHeight: 44, minWidth: 140 }} disabled={!stepValid} onClick={() => setStep((s) => s + 1)}>Continue</button>
        ) : (
          <button type="button" className="btn btn-primary" style={{ minHeight: 44, minWidth: 160 }} disabled={submitting} onClick={submit}>
            {submitting ? "Creating…" : "Create distributor"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── steps ─────────────────────────────── */

const H3: React.CSSProperties = { margin: 0, color: "var(--accent-700)", fontSize: 22, fontWeight: 600 };
const HELP: React.CSSProperties = { fontSize: 14, color: "var(--neutral-700)", margin: "4px 0 0" };

function StepAccount({ name, onName, slug, onSlug, slugState }: {
  name: string; onName: (v: string) => void; slug: string; onSlug: (v: string) => void; slugState: SlugState;
}) {
  const msg: Record<SlugState, { text: string; color: string; icon: string }> = {
    empty: { text: "Lowercase letters, numbers and hyphens.", color: "var(--neutral-700)", icon: "ph-info" },
    checking: { text: "Checking availability…", color: "var(--neutral-700)", icon: "ph-circle-notch" },
    bad_format: { text: "Use 3–30 lowercase letters, numbers or hyphens; no leading or trailing hyphen.", color: "var(--color-accent-2-700, #aa0b56)", icon: "ph-warning-circle" },
    reserved: { text: `“${slug}” is reserved.`, color: "var(--color-accent-2-700, #aa0b56)", icon: "ph-warning-circle" },
    taken: { text: `${slug}.${ROOT} is already taken.`, color: "var(--color-accent-2-700, #aa0b56)", icon: "ph-warning-circle" },
    ok: { text: `${slug}.${ROOT} is available.`, color: "var(--accent-700)", icon: "ph-check-circle" },
  };
  const m = msg[slugState];
  return (
    <div style={{ maxWidth: 560, display: "flex", flexDirection: "column", gap: 20 }}>
      <div><h3 style={H3}>Account</h3><p style={HELP}>The distributor’s name and the subdomain their team will use.</p></div>
      <div className="field">
        <label>Distributor name</label>
        <input className="input" value={name} onChange={(e) => onName(e.target.value)} placeholder="e.g. Metro Upfit & Equipment" style={{ minHeight: 46, fontSize: 16 }} />
      </div>
      <div className="field">
        <label>Subdomain</label>
        <div style={{ display: "flex", alignItems: "stretch" }}>
          <input className="input" value={slug} onChange={(e) => onSlug(e.target.value)} placeholder="metro-upfit" style={{ minHeight: 46, borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
          <span style={{ display: "grid", placeItems: "center", padding: "0 12px", background: "var(--neutral-200)", borderRadius: "0 var(--radius-md) var(--radius-md) 0", fontSize: 14, color: "var(--neutral-800)" }}>.{ROOT}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 13, color: m.color }}>
          <i className={`ph-duotone ${m.icon}`} /><span>{m.text}</span>
        </div>
      </div>
      <p style={HELP}>Wildcard DNS and HTTPS cover every subdomain, so no manual DNS setup is needed.</p>
    </div>
  );
}

export function StepBranding({ name, color, setColor, color2, setColor2, logoUrl, logoBusy, logoError, onLogo, onRemoveLogo }: {
  name: string; color: string; setColor: (v: string) => void; color2: string; setColor2: (v: string) => void;
  logoUrl: string | null; logoBusy: boolean; logoError: string; onLogo: (f: File | null) => void; onRemoveLogo: () => void;
}) {
  const ratio = whiteContrast(color);
  const contrast = !hexOk(color)
    ? { text: "Enter a six-digit hex color, e.g. #1d6b3c.", bad: true }
    : (ratio ?? 0) >= 4.5
      ? { text: `White text on this color passes contrast (${ratio}:1).`, bad: false }
      : { text: `White text on this color is hard to read (${ratio}:1). Pick a darker shade for buttons.`, bad: true };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 48 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div><h3 style={H3}>Branding</h3><p style={HELP}>Logo and colors carry through the rep app, emails and manager screens.</p></div>
        <div className="field">
          <label>Logo</label>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 120, height: 64, borderRadius: "var(--radius-md)", border: "1px solid var(--neutral-300)", display: "grid", placeItems: "center", background: logoUrl ? `center/contain no-repeat url(${logoUrl})` : "var(--neutral-100)" }}>
              {!logoUrl && <i className="ph-duotone ph-image" style={{ fontSize: 24, color: "var(--neutral-600)" }} />}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label className="btn btn-secondary" style={{ minHeight: 40, cursor: "pointer" }}>
                <i className="ph-duotone ph-upload-simple" />
                <span>{logoBusy ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}</span>
                <input type="file" accept="image/png,image/svg+xml,image/jpeg" style={{ display: "none" }} onChange={(e) => onLogo(e.target.files?.[0] ?? null)} />
              </label>
              {logoUrl && <button type="button" className="btn btn-ghost" style={{ fontSize: 13 }} onClick={onRemoveLogo}>Remove</button>}
            </div>
          </div>
          {logoError && <p style={{ fontSize: 13, color: "var(--color-accent-2-700, #aa0b56)", margin: "6px 0 0" }}>{logoError}</p>}
          <p style={HELP}>PNG or SVG on a transparent background, at least 400px wide.</p>
        </div>
        <ColorField label="Primary color" value={color} setValue={setColor} swatches={SW1} note={{ text: contrast.text, bad: contrast.bad }} />
        <ColorField label="Secondary color" value={color2} setValue={setColor2} swatches={SW2} note={{ text: "Used sparingly, for opportunity flags and warnings.", bad: false }} />
      </div>

      {/* Preview */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>Preview</span>
        <div style={{ width: 250, borderRadius: 28, border: "1px solid var(--neutral-300)", padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {logoUrl
            ? <div style={{ height: 22, background: `left/contain no-repeat url(${logoUrl})` }} />
            : <span style={{ fontSize: 15, fontWeight: 600, color }}>{name || "Distributor name"}</span>}
          <span style={{ fontSize: 28, fontWeight: 600 }}>4 / 10</span>
          <div style={{ display: "flex", gap: 3 }}>
            {Array.from({ length: 10 }, (_, i) => <div key={i} style={{ flex: 1, height: 8, borderRadius: 4, background: i < 4 ? color : "var(--neutral-200)" }} />)}
          </div>
          <span style={{ background: color, color: "#fff", textAlign: "center", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 600 }}>Start</span>
          <span style={{ fontSize: 12, fontWeight: 600, color }}>Prospects</span>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>Huron Valley Plumbing</span><span>4.8</span></div>
          <span style={{ alignSelf: "flex-start", background: color2, color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>Opportunity</span>
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, value, setValue, swatches, note }: {
  label: string; value: string; setValue: (v: string) => void; swatches: string[]; note: { text: string; bad: boolean };
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {swatches.map((s) => (
          <button key={s} type="button" aria-label={s} onClick={() => setValue(s)} style={{
            width: 36, height: 36, borderRadius: "50%", background: s, border: "none", cursor: "pointer",
            boxShadow: value.toLowerCase() === s.toLowerCase() ? "0 0 0 3px #fff, 0 0 0 5px var(--text)" : "none",
          }} />
        ))}
        <input className="input" value={value} onChange={(e) => setValue(e.target.value.trim())} style={{ width: 110, minHeight: 40, fontFamily: "monospace" }} />
      </div>
      <p style={{ fontSize: 13, color: note.bad ? "var(--color-accent-2-700, #aa0b56)" : "var(--accent-700)", margin: "6px 0 0" }}>{note.text}</p>
    </div>
  );
}

export function StepUsers({ mgr, setMgr, reps, setReps }: {
  mgr: { name: string; email: string }; setMgr: (v: { name: string; email: string }) => void;
  reps: RepDraft[]; setReps: React.Dispatch<React.SetStateAction<RepDraft[]>>;
}) {
  const setRep = (i: number, patch: Partial<RepDraft>) => setReps((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 24 }}>
      <div><h3 style={H3}>Users</h3><p style={HELP}>The manager signs in with their email and a password. Reps are passwordless and sign in from their daily email.</p></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Distributor manager</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field"><label>Name</label><input className="input" value={mgr.name} onChange={(e) => setMgr({ ...mgr, name: e.target.value })} placeholder="Name" style={{ minHeight: 44 }} /></div>
          <div className="field"><label>Email</label><input className="input" value={mgr.email} onChange={(e) => setMgr({ ...mgr, email: e.target.value })} placeholder="name@company.com" style={{ minHeight: 44 }} /></div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sales reps</h4>
        {reps.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr 110px 40px", gap: 10, alignItems: "center" }}>
            <input className="input" value={r.name} onChange={(e) => setRep(i, { name: e.target.value })} placeholder="Name" style={{ minHeight: 42 }} />
            <input className="input" value={r.email} onChange={(e) => setRep(i, { email: e.target.value })} placeholder="name@company.com" style={{ minHeight: 42 }} />
            <input className="input" type="number" min={1} value={r.target} onChange={(e) => setRep(i, { target: Math.max(1, parseInt(e.target.value) || 1) })} style={{ minHeight: 42, textAlign: "right" }} />
            <button type="button" className="btn btn-ghost" aria-label="Remove rep" title="Remove" onClick={() => setReps((rs) => rs.filter((_, j) => j !== i))} style={{ color: "var(--color-accent-2-700, #aa0b56)" }}><i className="ph-duotone ph-trash" /></button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setReps((rs) => [...rs, { name: "", email: "", target: 10 }])}>
          <i className="ph-duotone ph-plus" /><span>Add rep</span>
        </button>
      </div>
    </div>
  );
}

export function StepPrograms({ catalog, progs, setProgs }: {
  catalog: CatalogProgram[]; progs: Record<string, ProgDraft>; setProgs: React.Dispatch<React.SetStateAction<Record<string, ProgDraft>>>;
}) {
  const patch = (id: string, p: Partial<ProgDraft>) => setProgs((cur) => ({ ...cur, [id]: { ...cur[id], ...p } }));
  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 20 }}>
      <div><h3 style={H3}>Manufacturer programs</h3><p style={HELP}>Each program links a manufacturer’s VIO cohort to this distributor and to one regional rep.</p></div>
      {catalog.length === 0 && <p style={HELP}>No manufacturer programs exist yet. Add a manufacturer first.</p>}
      {catalog.map((p) => {
        const d = progs[p.id];
        return (
          <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17, fontWeight: 600 }}>
              <input type="checkbox" checked={d.on} onChange={(e) => patch(p.id, { on: e.target.checked })} style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
              {p.manufacturerName} — {p.name}
            </label>
            {d.on && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingLeft: 28 }}>
                <div className="field"><label>Cohort name</label><input className="input" value={d.cohort} onChange={(e) => patch(p.id, { cohort: e.target.value })} style={{ minHeight: 42 }} /></div>
                <div className="field"><label>Regional rep</label>
                  <select className="input" value={d.regionalRepUserId} onChange={(e) => patch(p.id, { regionalRepUserId: e.target.value })} style={{ minHeight: 42 }}>
                    <option value="">Unassigned</option>
                    {p.regionals.map((r) => <option key={r.id} value={r.id}>{r.name ?? r.email}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p style={HELP}>Manufacturer reports count only companies imported under that program’s source code. The distributor’s own customers are never visible to the manufacturer.</p>
    </div>
  );
}

function StepReview({ name, slug, color, color2, logoUrl, mgr, reps, catalog, progs }: {
  name: string; slug: string; color: string; color2: string; logoUrl: string | null;
  mgr: { name: string; email: string }; reps: RepDraft[]; catalog: CatalogProgram[]; progs: Record<string, ProgDraft>;
}) {
  const repList = reps.filter((r) => r.name.trim()).map((r) => `${r.name} (${r.target}/day)`).join(", ") || "None yet";
  const onProgs = catalog.filter((p) => progs[p.id]?.on);
  const progList = onProgs.length
    ? onProgs.map((p) => {
        const d = progs[p.id];
        const rep = p.regionals.find((r) => r.id === d.regionalRepUserId);
        return `${p.manufacturerName} — ${p.name} · ${d.cohort || "no cohort"} · ${rep ? (rep.name ?? rep.email) : "no regional rep"}`;
      }).join("; ")
    : "None";
  const rows: [string, string][] = [
    ["Distributor", name],
    ["URL", `${slug}.${ROOT}`],
    ["Colors", `${color} primary · ${color2} secondary · ${logoUrl ? "logo uploaded" : "no logo yet"}`],
    ["Manager", `${mgr.name} · ${mgr.email}`],
    ["Sales reps", repList],
    ["Programs", progList],
  ];
  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 16 }}>
      <h3 style={H3}>Review</h3>
      <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", rowGap: 12, columnGap: 16 }}>
        {rows.map(([k, v]) => (
          <div key={k} style={{ display: "contents" }}>
            <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{k}</span>
            <span style={{ fontSize: 15 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Created({ created }: { created: Extract<CreateDistributorResult, { ok: true }> }) {
  const checks = [
    `Subdomain ${created.slug}.${ROOT} resolves to this tenant only`,
    "HTTPS covered by the wildcard certificate",
    `Password setup email sent to ${created.managerEmail}`,
    `${created.repCount} rep${created.repCount === 1 ? "" : "s"} added · each gets a sign-in link with their first daily email`,
  ];
  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 20 }}>
      <i className="ph-duotone ph-check-circle" style={{ fontSize: 48, color: "var(--accent-500)" }} />
      <h2 style={{ margin: 0, fontSize: 27, fontWeight: 600 }}>{created.name} is set up at {created.slug}.{ROOT}</h2>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
        {checks.map((c) => (
          <li key={c} style={{ display: "flex", gap: 10, fontSize: 15 }}>
            <i className="ph-duotone ph-check-circle" style={{ color: "var(--accent-700)", flex: "none", marginTop: 2 }} />
            <span>{c}</span>
          </li>
        ))}
      </ul>
      {created.setupLink && (
        <p style={{ fontSize: 13, color: "var(--neutral-700)", padding: "10px 12px", background: "var(--neutral-100)", borderRadius: "var(--radius-md)", wordBreak: "break-all" }}>
          <strong>Dev:</strong> manager password-setup link —{" "}
          <a href={created.setupLink}>{created.setupLink}</a>
        </p>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <Link href={`/distributors/${created.id}`} className="btn btn-primary" style={{ minHeight: 44 }}>Open account</Link>
        <Link href="/" className="btn btn-secondary" style={{ minHeight: 44 }}>Back to distributors</Link>
      </div>
    </div>
  );
}
