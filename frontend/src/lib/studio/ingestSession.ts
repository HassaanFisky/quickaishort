/**
 * M3 — Session-local ingest recovery (YouTube / direct URL only).
 * Zero cloud cost: sessionStorage only. File blobs cannot survive refresh.
 */

export interface IngestSessionSnapshot {
  v: 1;
  url: string;
  fingerprint: string;
  kind: "youtube" | "direct_url";
  title?: string | null;
}

const KEY = "qai_ingest_session_v1";

export function saveIngestSession(snap: IngestSessionSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(snap));
  } catch {
    /* private mode / quota */
  }
}

export function loadIngestSession(): IngestSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as IngestSessionSnapshot;
    if (parsed?.v !== 1 || !parsed.url || !parsed.fingerprint) return null;
    if (parsed.kind !== "youtube" && parsed.kind !== "direct_url") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearIngestSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
