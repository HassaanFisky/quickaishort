import type { EditorAction, CaptionStyle } from "@/stores/editorStore";
import type { PreflightResult, PersonaVote } from "@/types/preflight";

export type PreflightFixType = "hook" | "pacing" | "caption" | "format";
export type PreflightFixImpact = "low" | "medium" | "high";

export interface PreflightFixSuggestion {
  id: string;
  type: PreflightFixType;
  title: string;
  reason: string;
  expectedImpact: PreflightFixImpact;
  startSec?: number;
  endSec?: number;
  actions: EditorAction[];
  applied?: boolean;
}

export interface PreflightFixPlan {
  clipStartSec: number;
  clipEndSec: number;
  score: number;
  recommendation: PreflightResult["recommendation"];
  suggestions: PreflightFixSuggestion[];
  generatedAt: number;
}

interface FixPlanEditorState {
  captionsEnabled?: boolean;
  exportSettings?: {
    aspectRatio?: string;
    filter?: string;
  };
  selectedClipId?: string | null;
  frameFilters?: any;
}

const DEFAULT_CAPTION_STYLE: Partial<CaptionStyle> = {
  fontSize: 34,
  color: "#FFFFFF",
  background: "rgba(0,0,0,0.55)",
  position: "bottom",
  bold: true,
};

function clampTime(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function avgDropOff(votes: readonly PersonaVote[]): number | null {
  const xs = votes
    .map((v) => v.drop_off_second)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function weakHookCount(votes: readonly PersonaVote[]): number {
  return votes.filter((v) => v.hook_verdict === "weak").length;
}

function scrollCount(votes: readonly PersonaVote[]): number {
  return votes.filter((v) => !v.would_watch_full).length;
}

function transcriptHook(transcript: string): string {
  const cleaned = transcript.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Wait for the key moment";
  return cleaned.length > 64 ? cleaned.slice(0, 61).trim() + "..." : cleaned;
}

function unique<T extends PreflightFixSuggestion>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export function buildPreflightFixPlan(
  result: PreflightResult | null,
  state: FixPlanEditorState,
): PreflightFixPlan | null {
  if (!result?.clip_candidate) return null;

  const base = result.clip_candidate;
  const refined = result.refined_clip;

  const start = clampTime(refined?.start_sec ?? base.start_sec, 0);
  const end = clampTime(refined?.end_sec ?? base.end_sec, Math.max(start + 1, start + 15));
  const score = clampTime(result.weighted_consensus_score, 0);

  const weakHooks = weakHookCount(result.persona_votes);
  const scrolls = scrollCount(result.persona_votes);
  const drop = avgDropOff(result.persona_votes);

  const suggestions: PreflightFixSuggestion[] = [];

  if (weakHooks > 0 || score < 70) {
    const hookText = transcriptHook(base.transcript);
    suggestions.push({
      id: "hook-fix",
      type: "hook",
      title: "Strengthen the first 3 seconds",
      reason:
        weakHooks > 0
          ? `${weakHooks} audience persona${weakHooks === 1 ? "" : "s"} flagged the hook as weak.`
          : "The consensus score suggests the opening needs a stronger reason to keep watching.",
      expectedImpact: weakHooks >= 2 || score < 55 ? "high" : "medium",
      startSec: start,
      endSec: Math.min(end, start + 3),
      actions: [
        {
          type: "SEEK",
          payload: { time: start },
        },
        {
          type: "ADD_CAPTION",
          payload: {
            text: hookText,
            startTime: start,
            endTime: Math.min(end, start + 3),
            style: DEFAULT_CAPTION_STYLE,
          },
        },
        {
          type: "TOGGLE_CAPTIONS",
          payload: { enabled: true },
        },
      ],
    });
  }

  if (refined && (refined.start_sec !== base.start_sec || refined.end_sec !== base.end_sec)) {
    suggestions.push({
      id: "refined-trim",
      type: "pacing",
      title: "Apply refined clip range",
      reason: "Pre-Flight produced a tighter refined range for this candidate.",
      expectedImpact: "high",
      startSec: refined.start_sec,
      endSec: refined.end_sec,
      actions: [
        {
          type: "TRIM",
          payload: { start: refined.start_sec, end: refined.end_sec },
        },
        {
          type: "SEEK",
          payload: { time: refined.start_sec },
        },
      ],
    });
  } else if (drop !== null && drop > start && drop < end && scrolls > 0) {
    suggestions.push({
      id: "dropoff-trim",
      type: "pacing",
      title: "Trim before predicted drop-off",
      reason: `${scrolls} audience persona${scrolls === 1 ? "" : "s"} may stop watching around ${drop.toFixed(1)}s.`,
      expectedImpact: scrolls >= 3 ? "high" : "medium",
      startSec: start,
      endSec: Math.max(start + 2, drop),
      actions: [
        {
          type: "TRIM",
          payload: { start, end: Math.max(start + 2, drop) },
        },
      ],
    });
  }

  if (!state.captionsEnabled) {
    suggestions.push({
      id: "enable-captions",
      type: "caption",
      title: "Enable captions",
      reason: "Short-form viewers often watch without sound; captions reduce comprehension friction.",
      expectedImpact: "medium",
      startSec: start,
      endSec: end,
      actions: [
        {
          type: "TOGGLE_CAPTIONS",
          payload: { enabled: true },
        },
      ],
    });
  }

  if (state.exportSettings?.aspectRatio && state.exportSettings.aspectRatio !== "9:16") {
    suggestions.push({
      id: "format-vertical",
      type: "format",
      title: "Switch to vertical format",
      reason: "This candidate is being evaluated for short-form feeds; vertical framing is the safer default.",
      expectedImpact: "medium",
      startSec: start,
      endSec: end,
      actions: [],
    });
  }

  return {
    clipStartSec: start,
    clipEndSec: end,
    score,
    recommendation: result.recommendation,
    suggestions: unique(suggestions).slice(0, 3),
    generatedAt: Date.now(),
  };
}
