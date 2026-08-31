/** Dub Video client stage labels — mirrors backend DubStage. */

import { localeRegistry } from "@/lib/i18n/registry";

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

// BCP 47 language tag (e.g. "ur", "ur-PK"). Target languages are derived from
// the canonical locale registry: a dub target must be translatable AND have a
// configured TTS voice. Adding a language is a data change, not a code change.
export type DubTargetLang = string;

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

export const DUB_LANG_OPTIONS: Array<{ code: DubTargetLang; label: string; nativeName: string }> =
  localeRegistry
    .locales()
    // Base-language entries only (no region variants) that are both
    // translatable and speakable, excluding the source language (en).
    .filter(
      (e) => e.speech && e.translation && e.id === e.language && e.language !== "en",
    )
    .map((e) => ({ code: e.id, label: e.displayName, nativeName: e.nativeName }));

export function isDubTerminal(stage: DubStage): boolean {
  return (
    stage === "ready" ||
    stage === "degraded" ||
    stage === "failed" ||
    stage === "cancelled"
  );
}
