"use client";

import { useActionState } from "react";
import { requestRepLink, type RepLinkState } from "@/lib/rep/actions";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "13px 14px",
  fontSize: 16, // 16px avoids iOS zoom-on-focus
  fontFamily: "inherit",
  border: "1px solid var(--neutral-300)",
  borderRadius: "var(--radius-lg)",
  background: "#fff",
};

export function RepLoginForm() {
  const [state, action, pending] = useActionState<RepLinkState | undefined, FormData>(
    requestRepLink,
    undefined,
  );

  if (state?.devLink) {
    return (
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            padding: "14px 16px",
            background: "var(--neutral-100)",
            border: "1px solid var(--divider)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)" }}>
            Dev mode — no email sent
          </div>
          <p style={{ fontSize: 14, color: "var(--neutral-700)", margin: "6px 0 14px" }}>
            In production this link is emailed to you. For now, open it directly:
          </p>
          <a
            href={state.devLink}
            style={{
              display: "block",
              textAlign: "center",
              padding: "14px 16px",
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              background: "var(--accent-500)",
              borderRadius: "var(--radius-lg)",
              textDecoration: "none",
            }}
          >
            Open my queue →
          </a>
        </div>
      </div>
    );
  }

  if (state?.sent) {
    return (
      <p style={{ marginTop: 24, fontSize: 15, color: "var(--neutral-700)" }}>
        If that email belongs to a rep, a sign-in link is on its way. Check your
        inbox on this device.
      </p>
    );
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        Work email
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          placeholder="you@company.com"
          style={inputStyle}
        />
      </label>

      {state?.error && (
        <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        style={{
          marginTop: 4,
          padding: "14px 16px",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          color: "#fff",
          background: "var(--accent-500)",
          border: "none",
          borderRadius: "var(--radius-lg)",
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
