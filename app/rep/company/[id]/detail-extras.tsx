"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  recordQuoteAction,
  removeDecisionMakerAction,
  saveDecisionMakerAction,
} from "@/lib/rep/actions";
import { showToast } from "@/lib/rep/toast";

export interface DecisionMaker {
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

const H3: React.CSSProperties = {
  margin: 0,
  color: "var(--accent-700)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 25,
  fontWeight: 600,
};

export function DecisionMakerSection({
  companyId,
  initial,
  confirmedAt,
}: {
  companyId: string;
  initial: DecisionMaker | null;
  confirmedAt: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(!!initial);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    title: initial?.title ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    notes: initial?.notes ?? "",
  });
  const [note, setNote] = useState("");

  function save() {
    if (!f.name.trim()) {
      setNote("Enter a name.");
      return;
    }
    start(async () => {
      const res = await saveDecisionMakerAction(companyId, f);
      if (res.error) setNote(res.error);
      else {
        setNote("");
        showToast("Decision-maker confirmed.");
        router.refresh();
      }
    });
  }
  function remove() {
    start(async () => {
      const res = await removeDecisionMakerAction(companyId);
      if (res.error) setNote(res.error);
      else {
        setF({ name: "", title: "", phone: "", email: "", notes: "" });
        setOpen(false);
        setNote("");
        showToast("Decision-maker removed.");
        router.refresh();
      }
    });
  }

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={H3}>
        <i className="ph-duotone ph-user-circle-check" style={{ fontSize: 26 }} />
        <span>Decision-Maker</span>
      </h3>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost" style={{ alignSelf: "flex-start", paddingLeft: 0, minHeight: 44 }}>
          <i className="ph-duotone ph-plus" />
          <span>Enter decision-maker</span>
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {initial && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="tag tag-accent">Confirmed primary</span>
              {confirmedAt && <span style={{ fontSize: 12, color: "var(--neutral-700)" }}>Confirmed · {confirmedAt}</span>}
            </div>
          )}
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Full name" style={{ minHeight: 44, fontSize: 16, fontWeight: 600 }} /></Field>
          <Field label="Title"><input className="input" value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Fleet Manager" style={{ minHeight: 44, fontSize: 15 }} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Phone"><input className="input" value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="Direct line" style={{ minHeight: 44, fontSize: 15 }} /></Field>
            <Field label="Email"><input className="input" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} inputMode="email" placeholder="Email" style={{ minHeight: 44, fontSize: 15 }} /></Field>
          </div>
          <Field label="Notes"><input className="input" value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Best time to reach, etc." style={{ minHeight: 44, fontSize: 15 }} /></Field>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button type="button" disabled={pending || !f.name.trim()} onClick={save} className="btn btn-primary" style={{ minHeight: 44 }}>
              {initial ? "Save" : "Confirm as primary"}
            </button>
            {initial && (
              <button type="button" disabled={pending} onClick={remove} className="btn btn-ghost" style={{ color: "var(--color-accent-2-700)" }}>
                <i className="ph-duotone ph-user-minus" />
                <span>Remove as primary</span>
              </button>
            )}
          </div>
        </div>
      )}
      {note && <span style={{ fontSize: 13, color: "var(--accent-700)" }}>{note}</span>}
    </section>
  );
}

export function QuoteSection({ companyId, count }: { companyId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  function record() {
    start(async () => {
      const res = await recordQuoteAction(companyId);
      if (res.error) setNote(res.error);
      else {
        setNote("");
        showToast("Quote recorded.");
        router.refresh();
      }
    });
  }
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={H3}>
        <i className="ph-duotone ph-flag-banner" style={{ fontSize: 26 }} />
        <span>Opportunity</span>
      </h3>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 56 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>Quote sent</span>
          <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
            {count === 0 ? "No quotes recorded yet. No dollar amounts." : `${count} recorded.`}
          </span>
        </div>
        <button type="button" disabled={pending} onClick={record} className="btn btn-secondary" style={{ minHeight: 44 }}>
          <i className="ph-duotone ph-receipt" />
          <span>Record quote</span>
        </button>
      </div>
      <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>
        Flag an opportunity from the outcome panel above — it leaves the Prospects queue on save.
      </span>
      {note && <span style={{ fontSize: 13, color: "var(--accent-700)" }}>{note}</span>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}
