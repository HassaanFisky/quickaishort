"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { API_URL } from "@/lib/api";

// ─── Event catalog ──────────────────────────────────────────────────────────

export type AnalyticsEvent =
  | { name: "video_loaded"; props: { source: "youtube" | "upload"; durationSec: number } }
  | { name: "ai_command_sent"; props: { commandType: string; success: boolean; latencyMs: number } }
  | { name: "feature_used"; props: { featureId: string; context: string } }
  | { name: "export_started"; props: { presetId: string; durationSec: number } }
  | { name: "export_completed"; props: { presetId: string; outputBytes: number; latencyMs: number } }
  | { name: "export_failed"; props: { presetId: string; errorType: string } }
  | { name: "preflight_run"; props: { consensusScore: number; personaCount: number } }
  | { name: "editor_error"; props: { errorType: string; componentStack?: string } }
  | { name: "page_view"; props: { path: string } };

interface QueuedEvent {
  name: AnalyticsEvent["name"];
  props: Record<string, unknown>;
  ts: number;
}

const QUEUE_KEY = "qai_analytics_queue";
const OPT_OUT_KEY = "qai_privacy_analytics"; // shared with settings Privacy tab
const CLIENT_ID_KEY = "qai_analytics_client_id";
const MAX_QUEUE = 100;
const FLUSH_INTERVAL_MS = 30_000;

// ─── Opt-out (shared key with the existing Privacy tab toggle) ─────────────

function isOptedIn(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(OPT_OUT_KEY);
    if (raw === null) return true; // matches Privacy tab default (true)
    return JSON.parse(raw) === true;
  } catch {
    return true;
  }
}

// ─── Anonymous per-browser client ID — never tied to account identity ──────

function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch {
    return "anonymous";
  }
}

// ─── Queue persistence ──────────────────────────────────────────────────────

function readQueue(): QueuedEvent[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage unavailable or full — queue just won't persist across reloads */
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  // editor_error is non-fatal-error monitoring (Sentry), not usage telemetry —
  // report it regardless of the analytics opt-out, mirroring how ErrorBoundary
  // already reports fatal errors unconditionally.
  if (event.name === "editor_error") {
    Sentry.captureMessage(`editor_error: ${event.props.errorType}`, "warning");
  }
  if (!isOptedIn()) return;
  const queue = readQueue();
  queue.push({ name: event.name, props: event.props, ts: Date.now() });
  while (queue.length > MAX_QUEUE) queue.shift();
  writeQueue(queue);
}

export function trackPageView(path: string): void {
  trackEvent({ name: "page_view", props: { path } });
}

export function getQueue(): QueuedEvent[] {
  return readQueue();
}

export function clearQueue(): void {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Flush ───────────────────────────────────────────────────────────────

let flushTimer: ReturnType<typeof setInterval> | null = null;

export async function flushQueue(): Promise<void> {
  if (typeof window === "undefined" || !isOptedIn()) return;
  const queue = readQueue();
  if (queue.length === 0) return;

  try {
    const res = await fetch(`${API_URL}/api/analytics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: getClientId(), events: queue }),
    });
    if (res.ok) clearQueue();
  } catch {
    // Network failure — leave the queue intact, retry on the next flush tick.
  }
}

/** Starts the 30s flush interval + visibility-change flush. Idempotent. */
export function initAnalyticsFlush(): void {
  if (typeof window === "undefined" || flushTimer !== null) return;
  flushTimer = setInterval(() => void flushQueue(), FLUSH_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushQueue();
  });
}

// ─── Route view tracking — mount once near the app root ────────────────────

export function RouteAnalytics() {
  const pathname = usePathname();
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initAnalyticsFlush();
    }
  }, []);

  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  return null;
}
