"use client";

import { useActionState } from "react";
import { setPassword } from "@/lib/auth/actions";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  fontSize: 15,
  fontFamily: "inherit",
  border: "1px solid var(--neutral-300)",
  borderRadius: "var(--radius-lg)",
  background: "#fff",
};

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(setPassword, undefined);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
      <input type="hidden" name="token" value={token} />
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        New password
        <input type="password" name="password" autoComplete="new-password" minLength={8} style={inputStyle} />
      </label>
      <label style={{ fontSize: 13, fontWeight: 600 }}>
        Confirm password
        <input type="password" name="confirm" autoComplete="new-password" minLength={8} style={inputStyle} />
      </label>

      {state?.error && (
        <p style={{ color: "var(--accent-700)", fontSize: 14, margin: 0 }}>{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending || !token}
        style={{
          marginTop: 8,
          padding: "13px 16px",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "inherit",
          color: "#fff",
          background: "var(--accent-500)",
          border: "none",
          borderRadius: "var(--radius-lg)",
          cursor: pending ? "wait" : "pointer",
          opacity: pending || !token ? 0.6 : 1,
        }}
      >
        {pending ? "Setting…" : "Set password and sign in"}
      </button>
    </form>
  );
}
