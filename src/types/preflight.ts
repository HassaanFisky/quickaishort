// Pre-Flight type definitions — mirrors fastapi/agent/preflight_agent.py Pydantic models exactly.

export type HookVerdict = "strong" | "weak" | "neutral";
export type Recommendation = "PUBLISH" | "REFINE_FIRST" | "DISCARD";

export interface PersonaVote {
  readonly persona_id: string;
  readonly would_watch_full: boolean;
  readonly predicted_retention_pct: number;
  readonly drop_off_second: number | null;
  readonly drop_off_reason: string | null;
  readonly hook_verdict: HookVerdict;
  readonly share_likelihood: number;
  readonly reasoning: string;
}

export interface ClipCandidatePayload {
  readonly start_sec: number;
  readonly end_sec: number;
  readonly score: number;
  readonly transcript: string;
}

export interface PreflightResult {
  readonly clip_candidate: ClipCandidatePayload;
  readonly persona_votes: readonly PersonaVote[];
  readonly weighted_consensus_score: number;
  readonly recommendation: Recommendation;
  readonly trend_context: Record<string, unknown> | null;
  readonly analytics_baseline: Record<string, unknown> | null;
  readonly bigquery_insight: string | null;
  readonly refined_clip: ClipCandidatePayload | null;
  readonly loop_iterations: number;
  readonly timed_out: boolean;
}

export interface PreflightResponse {
  readonly preflight_result: PreflightResult;
}
