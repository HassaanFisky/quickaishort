/**
 * M2 — Staged ingest FSM (URL + local upload).
 * Must stay aligned with fastapi/services/ingest_fsm.py.
 */

export const INGEST_STAGES = [
  "idle",
  "identify",
  "validate",
  "acquire_meta",
  "projectize",
  "analyze",
  "ready",
  "failed",
] as const;

export type IngestStage = (typeof INGEST_STAGES)[number];

export const TERMINAL_INGEST_STAGES = ["ready", "failed"] as const;
export type TerminalIngestStage = (typeof TERMINAL_INGEST_STAGES)[number];

export type IngestSourceKind = "youtube" | "direct_url" | "file";

export type IngestFailCode =
  | "unsupported_provider"
  | "unsupported_format"
  | "too_large"
  | "invalid_url"
  | "meta_fetch_failed"
  | "analysis_failed"
  | "cancelled"
  | "timeout"
  | "unknown";

const ALLOWED: Record<IngestStage, ReadonlySet<IngestStage>> = {
  idle: new Set(["identify", "failed"]),
  identify: new Set(["validate", "failed"]),
  validate: new Set(["acquire_meta", "failed"]),
  acquire_meta: new Set(["projectize", "failed"]),
  projectize: new Set(["analyze", "failed"]),
  analyze: new Set(["ready", "failed"]),
  // ready/failed → analyze = re-analysis without full re-ingest (M3)
  ready: new Set(["identify", "idle", "analyze"]),
  failed: new Set(["identify", "idle", "analyze"]),
};

export function isTerminalIngestStage(stage: IngestStage): boolean {
  return stage === "ready" || stage === "failed";
}

export function canTransitionIngest(current: IngestStage, next: IngestStage): boolean {
  if (current === next) return true;
  if (next === "failed" && !isTerminalIngestStage(current)) return true;
  return ALLOWED[current]?.has(next) ?? false;
}

/** Human labels for calm progress UI (no marketing fluff). */
export const INGEST_STAGE_LABELS: Record<IngestStage, string> = {
  idle: "Waiting",
  identify: "Reading your footage…",
  validate: "Checking format…",
  acquire_meta: "Uploading…",
  projectize: "Setting up project…",
  analyze: "Analysing the transcript…",
  ready: "Ready to edit",
  failed: "Something blocked processing",
};

/** Ordered progress steps shown in the UI (excludes idle/failed). */
export const INGEST_PROGRESS_STEPS: IngestStage[] = [
  "identify",
  "validate",
  "acquire_meta",
  "projectize",
  "analyze",
  "ready",
];

export function ingestStageIndex(stage: IngestStage): number {
  const i = INGEST_PROGRESS_STEPS.indexOf(stage);
  return i >= 0 ? i : stage === "failed" ? -1 : 0;
}

export function fingerprintYouTube(videoId: string): string {
  return `yt:${videoId}`;
}

export function fingerprintDirectUrl(url: string): string {
  return `url:${simpleHash(url.trim())}`;
}

export function fingerprintFile(file: File): string {
  return `file:${simpleHash(`${file.name}|${file.size}|${file.lastModified}`)}`;
}

/** Direct MP4/WebM/MOV link (not YouTube). Shared by lifecycle + EditorLayout. */
export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)([\?#].*)?$/i.test(url.trim());
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
