"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Sticky offline indicator.
 *
 * Listens to `online` / `offline` window events and reads
 * `navigator.onLine` on mount to handle the case where the user arrived
 * already offline. Renders nothing while online — zero footprint when not
 * needed.
 *
 * Placement: fixed below the top navbar at 80px so it does not collide
 * with the navbar floating glass surface, full-width on mobile, and never
 * overlaps the bottom tab bar.
 *
 * The notice does not block interaction — submit buttons elsewhere should
 * read `navigator.onLine` for their own gating rather than depending on
 * this component.
 */
export function OfflineNotice() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Read once on mount. `navigator.onLine === false` is reliable for the
    // "definitely offline" state; `true` is best-effort but acceptable for
    // a non-blocking hint surface.
    if (typeof navigator !== "undefined") {
      setIsOffline(!navigator.onLine);
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-[88px] z-40 -translate-x-1/2 px-4 w-full max-w-md"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 backdrop-blur-xl shadow-lg shadow-amber-500/10">
        <WifiOff
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            You&apos;re offline
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Some actions are paused. We&apos;ll reconnect automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
