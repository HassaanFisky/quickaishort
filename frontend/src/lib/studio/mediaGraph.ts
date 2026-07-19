/**
 * EP-003 MediaGraph client — grounded suggestions only (Phase 2 A5a).
 */

import axios from "axios";
import { API_URL } from "@/lib/api";

export interface SuggestionIntent {
  suggestion_id: string;
  label: string;
  capability_id: string | null;
  intent_kind: "capability" | "analyze_deeper" | "informational";
  params: Record<string, unknown>;
  evidence: { facet_keys: string[]; summary: string };
  confidence: number;
  interactive: boolean;
}

export interface MediaGraphDoc {
  graph_id: string;
  status: string;
  revision: number;
  facets: Record<string, unknown>;
}

export async function createMediaGraph(opts?: {
  project_id?: string | null;
  asset_id?: string | null;
}): Promise<MediaGraphDoc> {
  const { data } = await axios.post(`${API_URL}/api/studio/v1/media-graphs`, {
    project_id: opts?.project_id ?? null,
    asset_id: opts?.asset_id ?? null,
  });
  return data as MediaGraphDoc;
}

export async function upsertMediaGraphFacets(
  graphId: string,
  facets: Record<string, Record<string, unknown>>,
): Promise<MediaGraphDoc> {
  const { data } = await axios.post(
    `${API_URL}/api/studio/v1/media-graphs/${graphId}/facets`,
    { provenance: "edge", facets },
  );
  return data as MediaGraphDoc;
}

export async function fetchGroundedSuggestions(
  graphId: string,
): Promise<SuggestionIntent[]> {
  const { data } = await axios.get(
    `${API_URL}/api/studio/v1/media-graphs/${graphId}/suggestions`,
  );
  return (data?.suggestions ?? []) as SuggestionIntent[];
}

/** Build facet payloads from current editor edge signals. */
export function buildEdgeFacets(input: {
  duration: number;
  transcriptChunks?: { text: string; start: number; end: number }[] | null;
  silenceSegments?: { start: number; end: number }[] | null;
  captionsEnabled?: boolean;
  viralMoments?: { start: number; end: number; score: number }[] | null;
}): Record<string, Record<string, unknown>> {
  const facets: Record<string, Record<string, unknown>> = {
    duration: { seconds: input.duration },
    captions_present: { enabled: Boolean(input.captionsEnabled) },
  };
  if (input.transcriptChunks && input.transcriptChunks.length > 0) {
    facets.transcript = {
      chunk_count: input.transcriptChunks.length,
      chunks: input.transcriptChunks.slice(0, 200).map((c) => ({
        text: c.text,
        start: c.start,
        end: c.end,
      })),
    };
  }
  if (input.silenceSegments && input.silenceSegments.length > 0) {
    facets.silence = {
      segments: input.silenceSegments.map((s) => ({
        start: s.start,
        end: s.end,
      })),
    };
  }
  if (input.viralMoments && input.viralMoments.length > 0) {
    facets.viral_moments = {
      moments: input.viralMoments.map((m) => ({
        start: m.start,
        end: m.end,
        score: m.score,
      })),
    };
  }
  return facets;
}
