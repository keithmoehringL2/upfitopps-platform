"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseCsv } from "@/lib/import/csv";
import { IMPORT_FIELDS, REQUIRED_FIELDS, autoMap } from "@/lib/import/engine";
import { previewImportAction, commitImportAction, rollbackImportAction, type PreviewResult } from "@/lib/admin/actions";

type Preview = Extract<PreviewResult, { ok: true }>["result"];
const STEPS = ["Upload", "Map columns", "Preview", "Done"] as const;

interface FileState { name: string; text: string; headers: string[]; sample: string[]; rowCount: number }

export function ImportWizard({ distributorId, distributorName, sampleOwnerEmail, sampleProgramCode }: {
  distributorId: string; distributorName: string; sampleOwnerEmail: string; sampleProgramCode: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<FileState | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [owner, setOwner] = useState(false);
  const [ack, setAck] = useState(false);
  const [committed, setCommitted] = useState<{ counts: Preview["counts"]; batchId: string } | null>(null);
  const [rolledBack, setRolledBack] = useState(false);

  function loadText(text: string, name: string) {
    const rows = parseCsv(text);
    const headers = rows[0] ?? [];
    setFile({ name, text, headers, sample: rows[1] ?? [], rowCount: Math.max(0, rows.length - 1) });
    setMap(autoMap(headers));
    setPreview(null); setAck(false); setOwner(false);
  }
  async function onFile(f: File | null) {
    if (!f) return;
    loadText(await f.text(), f.name);
  }
  function useSample() {
    const owner = sampleOwnerEmail, prog = sampleProgramCode;
    const text = [
      "external_id,company_name,address,city,state,zip,phone,vio_industry,total_vehicles,truck_count,van_count,priority_score,owner_email,program_code",
      `SAMPLE-100,Riverside Welding,220 Industrial Way,Austin,TX,78744,(512) 555-0200,Welding,12,8,4,4.3,${owner},${prog}`,
      `SAMPLE-101,Cedar Park HVAC,90 Cypress Dr,Cedar Park,TX,78613,(512) 555-0201,HVAC,9,2,7,3.7,${owner},${prog}`,
      `SAMPLE-102,Bad Zip Co,3 Industrial,Austin,TX,4810,(512) 555-0202,Plumbing,5,2,3,3.0,,${prog}`,
      `SAMPLE-103,High Priority Co,4 Industrial,Austin,TX,78701,(512) 555-0203,Plumbing,5,2,3,7.9,,${prog}`,
    ].join("\n");
    loadText(text, `${distributorName.toLowerCase().replace(/\W+/g, "-")}-sample.csv`);
  }

  const mappedFields = Object.values(map).filter(Boolean);
  const missingRequired = REQUIRED_FIELDS.filter((k) => !mappedFields.includes(k));
  const dupFields = [...new Set(mappedFields.filter((f, i) => mappedFields.indexOf(f) !== i))];
  const mapValid = missingRequired.length === 0 && dupFields.length === 0;

  async function runPreview() {
    if (!file) return;
    setBusy(true); setError("");
    const res = await previewImportAction(distributorId, file.text, map);
    setBusy(false);
    if (res.ok) setPreview(res.result);
    else setError(res.error);
  }

  async function commit() {
    if (!file) return;
    setBusy(true); setError("");
    const res = await commitImportAction(distributorId, file.text, map, { owner }, file.name);
    setBusy(false);
    if (res.ok) { setCommitted({ counts: res.counts, batchId: res.batchId }); setStep(4); router.refresh(); }
    else setError(res.error);
  }

  async function rollback() {
    if (!committed) return;
    setBusy(true); setError("");
    const res = await rollbackImportAction(committed.batchId, distributorId);
    setBusy(false);
    if (res.ok) { setRolledBack(true); router.refresh(); }
    else setError(res.error);
  }

  async function next() {
    if (step === 2) { await runPreview(); setStep(3); }
    else if (step === 3) { await commit(); }
    else setStep((s) => s + 1);
  }
  const nextDisabled =
    busy ||
    (step === 1 && !file) ||
    (step === 2 && !mapValid) ||
    (step === 3 && (!preview || (preview.counts.skipped > 0 && !ack)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <Link href={`/distributors/${distributorId}`} className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0 }}>
        <i className="ph-duotone ph-caret-left" /><span>{distributorName}</span>
      </Link>
      <h1 style={{ margin: 0, fontSize: 34, fontWeight: 600 }}>Import companies</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {STEPS.map((label, i) => {
          const n = i + 1, done = n < step, active = n === step;
          return (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px", borderRadius: 999, fontSize: 14, fontWeight: active ? 600 : 400, background: active ? "var(--accent-100)" : "transparent" }}>
              <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, background: active || done ? "var(--accent-500)" : "var(--neutral-200)", color: active || done ? "#fff" : "var(--neutral-700)" }}>
                {done ? <i className="ph-bold ph-check" /> : n}
              </span>
              {label}
            </span>
          );
        })}
      </div>

      {error && <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{error}</p>}

      <div style={{ minHeight: 300 }}>
        {step === 1 && <StepUpload file={file} onFile={onFile} useSample={useSample} />}
        {step === 2 && file && <StepMap file={file} map={map} setMap={setMap} missingRequired={missingRequired} dupFields={dupFields} />}
        {step === 3 && <StepPreview preview={preview} file={file} owner={owner} setOwner={setOwner} ack={ack} setAck={setAck} />}
        {step === 4 && committed && <StepDone committed={committed} rolledBack={rolledBack} rollback={rollback} busy={busy} distributorId={distributorId} />}
      </div>

      {step < 4 && (
        <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 12, borderTop: "1px solid var(--divider)" }}>
          {step > 1 ? <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => setStep((s) => s - 1)}>Back</button> : <span />}
          <button type="button" className="btn btn-primary" style={{ minHeight: 44, minWidth: 150 }} disabled={nextDisabled} onClick={next}>
            {busy ? "Working…" : step === 3 ? "Commit import" : "Continue"}
          </button>
        </div>
      )}
    </div>
  );
}

function StepUpload({ file, onFile, useSample }: { file: FileState | null; onFile: (f: File | null) => void; useSample: () => void }) {
  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 16 }}>
      <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 20px", border: "2px dashed var(--neutral-300)", borderRadius: "var(--radius-lg)", cursor: "pointer" }}>
        <i className="ph-duotone ph-file-csv" style={{ fontSize: 44, color: "var(--accent-700)" }} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>Choose a CSV file</span>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Prepared by L2’s data team. UTF-8, one row per company.</span>
        <input type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>Or</span>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 40 }} onClick={useSample}>Use sample file</button>
      </div>
      {file && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "var(--neutral-100)", borderRadius: "var(--radius-md)" }}>
          <i className="ph-duotone ph-file-text" style={{ fontSize: 22, color: "var(--accent-700)" }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{file.name}</span>
            <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{file.rowCount} rows · {file.headers.length} columns</span>
          </div>
        </div>
      )}
    </div>
  );
}

function StepMap({ file, map, setMap, missingRequired, dupFields }: {
  file: FileState; map: Record<string, string>; setMap: (m: Record<string, string>) => void;
  missingRequired: string[]; dupFields: string[];
}) {
  const mappedCount = Object.values(map).filter(Boolean).length;
  const label = (k: string) => IMPORT_FIELDS.find((f) => f.key === k)?.label ?? k;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 14, color: "var(--neutral-800)" }}>{mappedCount} of {file.headers.length} columns mapped · {file.headers.length - mappedCount} not imported</span>
        <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Matching key: external_id, scoped to this distributor</span>
      </div>
      {(missingRequired.length > 0 || dupFields.length > 0) && (
        <p style={{ fontSize: 13, color: "var(--color-accent-2-700, #aa0b56)", margin: 0 }}>
          {missingRequired.length > 0 && `Map the required fields: ${missingRequired.map(label).join(", ")}.`}
          {dupFields.length > 0 && ` Each field can be mapped once: ${dupFields.map(label).join(", ")}.`}
        </p>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 720 }}>
          <thead><tr><th>CSV column</th><th>Sample value</th><th>Maps to</th><th></th></tr></thead>
          <tbody>
            {file.headers.map((h, i) => {
              const mappedKey = map[h] ?? "";
              const req = IMPORT_FIELDS.find((f) => f.key === mappedKey)?.required;
              return (
                <tr key={h}>
                  <td style={{ fontFamily: "monospace", fontSize: 13 }}>{h}</td>
                  <td style={{ fontSize: 13, color: "var(--neutral-700)" }}>{file.sample[i] || "(blank)"}</td>
                  <td>
                    <select className="input" value={mappedKey} onChange={(e) => setMap({ ...map, [h]: e.target.value })} style={{ minHeight: 38, minWidth: 220 }}>
                      <option value="">Don’t import</option>
                      {IMPORT_FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}{f.required ? " *" : ""}</option>)}
                    </select>
                  </td>
                  <td>{req && <span className="tag tag-accent">Required</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StepPreview({ preview, file, owner, setOwner, ack, setAck }: {
  preview: Preview | null; file: FileState | null; owner: boolean; setOwner: (b: boolean) => void; ack: boolean; setAck: (b: boolean) => void;
}) {
  if (!preview) return <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>Running the dry-run…</p>;
  const c = preview.counts;
  const tiles = [
    { label: "Rows in file", value: c.rows, sub: file?.name ?? "", bad: false },
    { label: "New companies", value: c.created, sub: "Unassigned unless owner_email is valid", bad: false },
    { label: "Updates", value: c.updated, sub: "Matched by external_id", bad: false },
    { label: "Errors", value: c.skipped, sub: "Skipped, listed below", bad: c.skipped > 0 },
  ];
  const prot = preview.protectedCounts;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{t.label}</span>
            <span style={{ fontSize: 34, fontWeight: 600, color: t.bad ? "var(--color-accent-2-700, #aa0b56)" : "var(--text)" }}>{t.value}</span>
            <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{t.sub}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 40 }}>
        {/* Protected on update */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--accent-700)" }}>
            <i className="ph-duotone ph-lock-key" /> Protected on update
          </h4>
          <p style={{ fontSize: 13, color: "var(--neutral-700)", margin: 0 }}>Fleet, priority and imported fields update. Local work is kept unless you explicitly allow an override.</p>
          <ProtRow title="Owner" sub={prot.owner > 0 ? `${prot.owner} matching companies have a local owner` : "No matching companies have a local owner"}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} style={{ accentColor: "var(--color-accent-2-500, #d6006c)" }} /> Override from file
            </label>
          </ProtRow>
          <ProtRow title="Confirmed decision-maker" sub={prot.pdm > 0 ? `${prot.pdm} matching companies have a confirmed primary` : "—"}><Locked /></ProtRow>
          <ProtRow title="Follow-up dates" sub={prot.fu > 0 ? `${prot.fu} matching companies have a scheduled follow-up` : "—"}><Locked /></ProtRow>
          <ProtRow title="Suppression and Do Not Contact" sub="Never replaced by an import"><Locked /></ProtRow>
          <ProtRow title="Activity, opportunities and quotes" sub="Every recorded outcome is kept"><Locked /></ProtRow>
          <p style={{ fontSize: 12, color: "var(--neutral-600)", margin: 0 }}>The import file carries owner_email, so only owner can be overridden; decision-maker and follow-up values are never in the file.</p>
        </div>

        {/* Errors */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, color: "var(--color-accent-2-700, #aa0b56)" }}>
            <i className="ph-duotone ph-warning" /> Rows that need attention
          </h4>
          {preview.errors.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>No row errors.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 360 }}>
                <thead><tr><th>Row</th><th>Issue</th><th>Detail</th></tr></thead>
                <tbody>
                  {preview.errors.map((e, i) => (
                    <tr key={i}>
                      <td>{e.row}<div style={{ fontSize: 11, color: "var(--neutral-600)", fontFamily: "monospace" }}>{e.externalId}</div></td>
                      <td style={{ fontWeight: 600 }}>{e.issue}</td>
                      <td style={{ fontSize: 13, color: "var(--neutral-700)" }}>{e.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {c.skipped > 0 && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, cursor: "pointer" }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--accent-500)" }} />
          Skip the {c.skipped} rows with errors and import the rest
        </label>
      )}
      {owner && <p style={{ fontSize: 13, color: "var(--neutral-700)", margin: 0 }}>Overriding owner replaces local owner assignments with the file’s values. This is recorded in the audit log under your name.</p>}
    </div>
  );
}

function ProtRow({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid color-mix(in srgb, var(--text) 8%, transparent)" }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>{sub}</span>
      </div>
      <div style={{ flex: "none" }}>{children}</div>
    </div>
  );
}
function Locked() {
  return <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--neutral-700)" }}><i className="ph-duotone ph-lock-simple" /> Never replaced</span>;
}

function StepDone({ committed, rolledBack, rollback, busy, distributorId }: {
  committed: { counts: Preview["counts"]; batchId: string }; rolledBack: boolean; rollback: () => void; busy: boolean; distributorId: string;
}) {
  const c = committed.counts;
  const tiles = [
    { label: "Created", value: c.created }, { label: "Updated", value: c.updated }, { label: "Skipped", value: c.skipped },
  ];
  return (
    <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 20 }}>
      <i className={`ph-duotone ${rolledBack ? "ph-arrow-u-up-left" : "ph-check-circle"}`} style={{ fontSize: 48, color: rolledBack ? "var(--neutral-700)" : "var(--accent-500)" }} />
      <h2 style={{ margin: 0, fontSize: 27, fontWeight: 600 }}>{rolledBack ? "Import rolled back" : "Import committed"}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 16, maxWidth: 420 }}>
        {tiles.map((t) => (
          <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--neutral-700)" }}>{t.label}</span>
            <span style={{ fontSize: 34, fontWeight: 600 }}>{t.value}</span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 14, color: "var(--neutral-700)" }}>
        {rolledBack ? "Created companies were removed and updated fields restored." : "New companies stay out of rep queues until assigned. Rollback is available here and from the Imports tab."}
      </p>
      <div style={{ display: "flex", gap: 10 }}>
        <Link href={`/distributors/${distributorId}`} className="btn btn-primary" style={{ minHeight: 44 }}>Back to account</Link>
        {!rolledBack && (
          <button type="button" className="btn btn-secondary" style={{ minHeight: 44, color: "var(--color-accent-2-700, #aa0b56)" }} disabled={busy} onClick={rollback}>
            <i className="ph-duotone ph-arrow-u-up-left" /><span>{busy ? "Rolling back…" : "Roll back this import"}</span>
          </button>
        )}
      </div>
    </div>
  );
}
