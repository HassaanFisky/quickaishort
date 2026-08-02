"use client";

import React, { useEffect } from "react";
import { getSharedPusher } from "@/lib/pusherClient";

/**
 * Eagerly warms the shared Pusher singleton so export/dub/dashboard hooks
 * reuse one connection. Channel ownership stays in those hooks.
 */
export function PusherProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    getSharedPusher();
  }, []);

  return <>{children}</>;
}
