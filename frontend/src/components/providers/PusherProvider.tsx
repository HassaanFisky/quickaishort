"use client";

import React from "react";

/**
 * Passthrough shell — job/dashboard channels are owned by focused hooks
 * (`useDashboardStats`, `useServerExport`, `useDubVideo`) to avoid duplicate
 * Pusher clients and dead `user-events-*` subscriptions that never receive emits.
 */
export function PusherProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
