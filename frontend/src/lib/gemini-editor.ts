import type { VideoAnalysis, VideoMetadata, ExportSettings } from "@/stores/editorStore";
import {
  authenticatedFetch,
  throwIfNotOk,
} from "@/lib/authenticatedFetch";

// ─── Editor state snapshot (context for command payloads) ─────────────────────

export interface EditorStateContext {
  clipIndex: number | null;
  clipStart: number | null;
  clipEnd: number | null;
  clipCount: number;
  selectedClipDuration: number | null;
  totalClips: number;
  videoDuration: number;
  markIn: number | null;
  markOut: number | null;
  timelineMarkerCount: number;
  filter: ExportSettings["filter"];
  audioBoost: number;
  playbackSpeed: number;
  noiseSuppression: number;
  captionsEnabled: boolean;
  captionCount: number;
  transitionEnabled: boolean;
  voiceoverEnabled: boolean;
  recentActions: string[];
}

// Suggestion chips: MediaGraph only (EP-003 / Phase 2 A5a).
// Live edit commands: sendEditorCommand → FastAPI /api/ai-editor/command (EP-001 registry).
// Orphan client EDITOR_SYSTEM_PROMPT + callGeminiEditor removed (TD-EP001-01 / TD-01).

// ─── Shared utility ───────────────────────────────────────────────────────────

export function buildVideoContext(
  meta: VideoMetadata | null,
  analysis: VideoAnalysis | null,
): string {
  if (!meta) return "No video loaded.";
  const parts = [
    `Title: ${meta.title}`,
    `Duration: ${meta.duration}s`,
    `Dimensions: ${meta.nativeWidth}x${meta.nativeHeight}`,
  ];
  if (analysis) {
    if (analysis.scenes.length > 0)
      parts.push(`Scenes: ${JSON.stringify(analysis.scenes.slice(0, 15))}`);
    if (analysis.transcript.length > 0)
      parts.push(`Transcript: ${JSON.stringify(analysis.transcript.slice(0, 25))}`);
    if (analysis.topics.length > 0)
      parts.push(`Topics: ${analysis.topics.join(", ")}`);
  }
  return parts.join("\n");
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

/** Canonical capability action from Capability Registry (EP-001) */
export type CanonicalEditorAction = {
  type: string
  [key: string]: unknown
}

export interface EditorCommandResponse {
  intent: string
  confidence: number
  /** Canonical AiEditorAction-shaped objects (`type` discriminator) */
  actions: CanonicalEditorAction[]
  feedback: string
  fallback: string
  model_used: string
  clamped?: string[]
  dropped?: string[]
  message?: string
  suggestions?: string[]
  status?: string
}

export interface ChatHistoryTurn {
  role: "user" | "assistant"
  content: string
}

export interface EditorCommandRequest {
  command: string
  user_tier?: "free" | "pro"
  project_context?: Record<string, unknown>
  stream?: boolean
  /** Prior Studio chat turns (bounded server-side). */
  history?: ChatHistoryTurn[]
  workload_id?: string
}

const MAX_TRANSCRIPT_CHUNKS = 40
const MAX_CAPTION_CHUNKS = 24
const MAX_TEXT_CHARS = 160

type TranscriptLike = {
  text?: string
  start?: number
  end?: number
  startTime?: number
  endTime?: number
} | null

type CaptionLike = {
  text?: string
  start?: number
  end?: number
}

/**
 * Bounded project_context for DualModelRouter / sanitiser.
 * Prefer rich keys the backend already reads; never dump unbounded transcript.
 */
export function buildProjectContextForCommand(input: {
  editorState: EditorStateContext
  selectedClipId: string | null
  currentTime?: number
  aspectRatio?: string
  runId?: string | null
  transcript?: TranscriptLike | { chunks?: TranscriptLike[] } | Array<TranscriptLike>
  captions?: CaptionLike[]
  videoAnalysis?: VideoAnalysis | null
}): Record<string, unknown> {
  const { editorState } = input
  const duration = editorState.videoDuration || 0

  const rawChunks: TranscriptLike[] = (() => {
    const t = input.transcript
    if (!t) return []
    if (Array.isArray(t)) return t
    if (typeof t === "object" && Array.isArray((t as { chunks?: unknown }).chunks)) {
      return (t as { chunks: TranscriptLike[] }).chunks
    }
    if (typeof t === "object" && typeof (t as { text?: string }).text === "string") {
      return [t as TranscriptLike]
    }
    return []
  })()

  const fromAnalysis = (input.videoAnalysis?.transcript ?? []).map((c) => ({
    text: c.text,
    start: c.startTime,
    end: c.endTime,
  }))

  const source = (rawChunks.length > 0 ? rawChunks : fromAnalysis).slice(
    0,
    MAX_TRANSCRIPT_CHUNKS,
  )
  const transcript = source
    .map((c) => {
      if (!c) return null
      const text = String(c.text ?? "").trim().slice(0, MAX_TEXT_CHARS)
      if (!text) return null
      const row = c as {
        start?: number
        end?: number
        startTime?: number
        endTime?: number
      }
      return {
        text,
        start: Number(row.start ?? row.startTime ?? 0),
        end: Number(row.end ?? row.endTime ?? 0),
      }
    })
    .filter(Boolean)

  const captions = (input.captions ?? [])
    .slice(0, MAX_CAPTION_CHUNKS)
    .map((c) => ({
      text: String(c.text ?? "").trim().slice(0, MAX_TEXT_CHARS),
      start: Number(c.start ?? 0),
      end: Number(c.end ?? 0),
    }))
    .filter((c) => c.text)

  return {
    clip_count: editorState.clipCount,
    duration,
    videoDuration: duration,
    currentTime: Number(input.currentTime ?? 0),
    selectedClipId: input.selectedClipId,
    elementCount: editorState.clipCount,
    captionCount: editorState.captionCount,
    captionsEnabled: editorState.captionsEnabled,
    aspectRatio: input.aspectRatio || "9:16",
    visualFilter: editorState.filter || "None",
    audioBoost: editorState.audioBoost,
    playbackSpeed: editorState.playbackSpeed,
    clipIndex: editorState.clipIndex,
    clipStart: editorState.clipStart,
    clipEnd: editorState.clipEnd,
    markIn: editorState.markIn,
    markOut: editorState.markOut,
    recentActions: editorState.recentActions.slice(-8),
    transcript,
    captions,
    run_id: input.runId || undefined,
  }
}

export type StreamStageEvent = {
  stage: string
  message?: string
}

function isStageEvent(obj: unknown): obj is StreamStageEvent {
  return (
    !!obj &&
    typeof obj === "object" &&
    "stage" in obj &&
    typeof (obj as { stage: unknown }).stage === "string" &&
    !("intent" in (obj as object)) &&
    !("actions" in (obj as object))
  )
}

// Main function — send command, get back tool actions
export async function sendEditorCommand(
  request: EditorCommandRequest
): Promise<EditorCommandResponse> {
  const response = await authenticatedFetch(`${API_BASE}/api/ai-editor/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  await throwIfNotOk(response);
  return response.json();
}

/** Streaming path — stage events then one JSON plan (honest progress). */
export async function streamEditorCommand(
  request: EditorCommandRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onStage?: (stage: StreamStageEvent) => void,
): Promise<EditorCommandResponse | null> {
  const response = await authenticatedFetch(
    `${API_BASE}/api/ai-editor/command/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, stream: true }),
    },
  );

  if (!response.ok) {
    await throwIfNotOk(response);
  }
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let assembled = "";
  let parsed: EditorCommandResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (!payload) continue;
      onChunk(payload);
      try {
        const obj = JSON.parse(payload) as EditorCommandResponse & {
          error?: string
          status?: number
        };
        if (obj.error) {
          throw new Error(obj.error);
        }
        if (isStageEvent(obj)) {
          onStage?.(obj);
          continue;
        }
        // Final plan events always carry intent/actions/feedback.
        if (
          typeof obj.intent === "string" ||
          Array.isArray(obj.actions) ||
          typeof obj.feedback === "string"
        ) {
          parsed = obj;
          if (typeof obj.feedback === "string") {
            assembled = obj.feedback;
          } else if (typeof obj.message === "string") {
            assembled = obj.message;
          }
        }
      } catch (err) {
        if (err instanceof SyntaxError) {
          assembled += payload;
          continue;
        }
        throw err;
      }
    }
  }
  onDone();
  return parsed;
}

// Health check
export async function checkAIEditorHealth(): Promise<{
  status: string
  primary_model: string
  free_model: string
}> {
  const response = await fetch(`${API_BASE}/api/ai-editor/health`)
  return response.json()
}
