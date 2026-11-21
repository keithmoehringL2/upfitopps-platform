"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { logOutcome } from "@/lib/rep/actions";
import { listOutbox, removeOutbox } from "@/lib/rep/outbox";
import { showToast } from "@/lib/rep/toast";

// Drains the offline outbox when the device is (or becomes) online: replays
// each queued outcome through the same logOutcome server action, removes it on
// success, then toasts and refreshes. Mounted once in the rep layout.
let draining = false;

export function OfflineSync() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function drain() {
      if (draining) return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      draining = true;
      try {
        const items = await listOutbox();
        let synced = 0;
        for (const it of items) {
          if (cancelled || (typeof navigator !== "undefined" && !navigator.onLine)) break;
          const fd = new FormData();
          for (const [k, v] of Object.entries(it.payload)) fd.set(k, v);
          try {
            const res = await logOutcome(undefined, fd);
            // Remove on success, or on a definitive rejection (e.g. the company
            // is no longer in the rep's queue) so the outbox can't get stuck.
            await removeOutbox(it.id);
            if (!res?.error) synced++;
          } catch {
            // Network error — stop and retry on the next online event.
            break;
          }
        }
        if (synced > 0 && !cancelled) {
          showToast(`Synced ${synced} outcome${synced === 1 ? "" : "s"}.`);
          router.refresh();
        }
      } finally {
        draining = false;
      }
    }

    void drain();
    const onOnline = () => void drain();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [router]);

  return null;
}
