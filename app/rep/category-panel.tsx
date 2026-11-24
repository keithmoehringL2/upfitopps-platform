"use client";

import Link from "next/link";

export interface PanelCounter {
  done: number;
  total: number;
  unit: string; // "done" | "attempts" | "checked in"
  toGoLabel: string; // "{n} to go" | "Goal reached" | "All done"
  start?:
    | { href: string; label?: string }
    | { onClick: () => void; label: string }
    | null;
}

// A full-screen sheet over the queue home. Slides up on mount. Holds a close
// control, an icon+title+description header, an optional counter with a Start
// button and a segmented progress bar, then the category's list as children.
export function CategoryPanel({
  icon,
  title,
  description,
  onClose,
  counter,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  onClose: () => void;
  counter?: PanelCounter | null;
  children: React.ReactNode;
}) {
  const segs = counter ? Math.min(counter.total, 20) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        maxWidth: 480,
        margin: "0 auto",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        animation: "repSheetUp 0.32s ease",
      }}
    >
      <style>{`@keyframes repSheetUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>

      <header
        style={{
          position: "sticky",
          top: 0,
          background: "var(--bg)",
          boxShadow: "0 1px 0 var(--divider)",
          padding: "max(12px, env(safe-area-inset-top)) 16px 8px",
        }}
      >
        <button type="button" onClick={onClose} className="btn btn-ghost" style={{ paddingLeft: 0, minHeight: 44, fontSize: 15 }}>
          <i className="ph-duotone ph-caret-down" style={{ fontSize: 18 }} />
          <span>Queue</span>
        </button>
      </header>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 140px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, color: "var(--accent-700)" }}>
            <i className={`ph-duotone ${icon}`} style={{ fontSize: 30 }} />
            <span>{title}</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: "var(--neutral-700)" }}>{description}</p>
        </div>

        {counter && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 56, fontWeight: 600, lineHeight: 0.9, letterSpacing: "-0.02em" }}>{counter.done}</span>
                <span style={{ fontSize: 22, color: "var(--neutral-700)" }}>/ {counter.total} {counter.unit}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, textAlign: "right", color: "var(--accent-700)", paddingBottom: 4 }}>
                {counter.toGoLabel}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {Array.from({ length: Math.max(segs, 1) }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: 14,
                    borderRadius: "var(--radius-md)",
                    background: i < counter.done ? "var(--accent-500)" : "var(--neutral-200)",
                  }}
                />
              ))}
            </div>
            {counter.start &&
              ("href" in counter.start ? (
                <Link href={counter.start.href} className="btn btn-primary" style={{ minHeight: 56, fontSize: 18, marginTop: 2 }}>
                  <i className="ph-duotone ph-play" style={{ fontSize: 20 }} />
                  <span>{counter.start.label ?? "Start"}</span>
                </Link>
              ) : (
                <button type="button" onClick={counter.start.onClick} className="btn btn-primary" style={{ minHeight: 56, fontSize: 18, marginTop: 2 }}>
                  <i className="ph-duotone ph-play" style={{ fontSize: 20 }} />
                  <span>{counter.start.label}</span>
                </button>
              ))}
          </section>
        )}

        {children}
      </div>
    </div>
  );
}
