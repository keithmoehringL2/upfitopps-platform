"use client";

import { useEffect, useState } from "react";

// A neutral-900 strip pinned under the status bar while the device is offline,
// matching the design handoff. Outcomes logged while offline are saved to a
// local IndexedDB outbox and replayed on reconnect (see OfflineSync).
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: "50%",
        transform: "translateX(-50%)",
        width: "100%",
        maxWidth: 480,
        zIndex: 70,
        background: "var(--neutral-900)",
        color: "#fff",
        fontSize: 13,
        textAlign: "center",
        padding: "max(6px, env(safe-area-inset-top)) 16px 6px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <i className="ph-duotone ph-wifi-slash" style={{ fontSize: 16 }} />
      <span>Offline · outcomes save on this phone and sync when you reconnect</span>
    </div>
  );
}
