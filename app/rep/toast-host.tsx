"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { subscribeToasts, showToast, type Toast } from "@/lib/rep/toast";
import { takeToast } from "@/lib/rep/session-state";

// Renders the stack of active toasts. Matches the design handoff: neutral-900
// fill, 14px text, a check mark, auto-dismiss after 3.2s, sitting 96px from the
// bottom on Company Detail and 40px elsewhere (clear of the action bar).
const DISMISS_MS = 3200;

export function ToastHost() {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Live toasts from the pub/sub.
  useEffect(() => subscribeToasts((t) => setToasts((prev) => [...prev, t])), []);

  // A toast handed over from the previous page (e.g. after logging an outcome
  // and navigating back to the queue).
  useEffect(() => {
    const t = takeToast();
    if (t) showToast(t);
  }, [pathname]);

  // Auto-dismiss.
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), DISMISS_MS),
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  const onDetail = pathname?.startsWith("/rep/company/") ?? false;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: `calc(${onDetail ? 96 : 40}px + env(safe-area-inset-bottom))`,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        padding: "0 20px",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderRadius: "var(--radius-md)",
            background: "var(--neutral-900)",
            color: "#fff",
            fontSize: 14,
            boxShadow: "var(--shadow-md, 0 6px 20px rgba(0,0,0,.25))",
          }}
        >
          <i className="ph-duotone ph-check-circle" style={{ fontSize: 20, flex: "none" }} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
