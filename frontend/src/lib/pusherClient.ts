/**
 * Shared browser Pusher singleton — one connection for export/dub/dashboard.
 * Hooks subscribe/unsubscribe channels; they must NOT disconnect the shared client.
 */

import Pusher from "pusher-js";

let shared: Pusher | null = null;

export function getSharedPusher(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (!key || !cluster) return null;

  if (!shared) {
    shared = new Pusher(key, { cluster });
  }
  return shared;
}

/** True when env keys exist and a client is (or can be) constructed. */
export function isPusherConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_PUSHER_KEY &&
    process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  );
}

/** Test/HMR helper — production hooks never call this. */
export function resetSharedPusherForTests(): void {
  if (shared) {
    try {
      shared.disconnect();
    } catch {
      /* ignore */
    }
    shared = null;
  }
}
