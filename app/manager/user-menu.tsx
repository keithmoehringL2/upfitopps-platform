"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { logout } from "@/lib/auth/actions";

function initialsOf(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return chars.toUpperCase();
}

export function UserMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={{
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: "var(--neutral-200)",
          color: "var(--neutral-900)",
          border: open ? "2px solid var(--accent-500)" : "2px solid transparent",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          padding: 0,
        }}
      >
        {initialsOf(email)}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 220,
            background: "var(--bg)",
            border: "1px solid var(--divider)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-md)",
            padding: 6,
            zIndex: 20,
          }}
        >
          <div style={{ padding: "8px 10px 10px" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--neutral-600)" }}>
              Signed in as
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>{email}</div>
          </div>
          <div style={{ height: 1, background: "var(--divider)", margin: "2px 0 4px" }} />
          <Link href="/manager/settings" role="menuitem" onClick={() => setOpen(false)} style={menuItem}>
            <i className="ph-duotone ph-gear-six" style={{ fontSize: 18 }} />
            <span>Settings</span>
          </Link>
          <form action={logout}>
            <button type="submit" role="menuitem" style={{ ...menuItem, width: "100%", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
              <i className="ph-duotone ph-sign-out" style={{ fontSize: 18 }} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

const menuItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 10px",
  fontSize: 15,
  color: "var(--text)",
  textDecoration: "none",
  borderRadius: "var(--radius-md)",
};
