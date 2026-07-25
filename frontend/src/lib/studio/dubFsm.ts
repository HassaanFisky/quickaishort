/** Dub Video client stage labels — mirrors backend DubStage. */

export type DubStage =
  | "idle"
  | "queued"
  | "translating"
  | "synthesizing"
  | "aligning"
  | "subtitling"
  | "ready"
  | "degraded"
  | "failed"
  | "cancelled";

export type DubMode = "full_dub" | "voiceover_only" | "captions_only";

export type DubTargetLang = "es" | "fr" | "hi" | "pt" | "de" | "ar" | "ur";

export const DUB_STAGE_LABELS: Record<DubStage, string> = {
  idle: "Ready to dub",
  queued: "Queued…",
  translating: "Translating speech…",
  synthesizing: "Generating voice…",
  aligning: "Aligning timing…",
  subtitling: "Preparing subtitles…",
  ready: "Dub ready",
  degraded: "Subtitles ready (voice unavailable)",
  failed: "Dub failed",
  cancelled: "Cancelled",
};

export const DUB_LANG_OPTIONS: Array<{ code: DubTargetLang; label: string }> = [
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
  { code: "de", label: "German" },
  { code: "ar", label: "Arabic" },
  { code: "ur", label: "Urdu" },
];

export function isDubTerminal(stage: DubStage): boolean {
  return (
    stage === "ready" ||
    stage === "degraded" ||
    stage === "failed" ||
    stage === "cancelled"
  );
}
