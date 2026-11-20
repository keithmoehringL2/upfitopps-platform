import { OfflineBanner } from "./offline-banner";
import { ToastHost } from "./toast-host";

// Mounts the device-level overlays once for every rep screen: the offline
// strip and the toast host. Both are fixed-position and centered on the mobile
// column, so they sit outside the per-page branded wrapper without disturbing
// its layout.
export default function RepLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <OfflineBanner />
      <ToastHost />
    </>
  );
}
