import type { VideoAnalysis, VideoMetadata, ExportSettings } from "@/stores/editorStore";
import {
  authenticatedFetch,
  throwIfNotOk,
} from "@/lib/authenticatedFetch";
import { mapAiEditorError } from "@/lib/aiEditorErrors";

export class AiEditorCommandError extends Error {
  readonly status?: number;
  readonly kind?: string;
  readonly retryAfterSeconds?: number;
  readonly body?: unknown;

  constructor(
    message: string,
    opts?: {
      status?: number;
      kind?: string;
      retryAfterSeconds?: number;
      body?: unknown;
    },
  ) {
    super(message);
    this.name = "AiEditorCommandError";
    this.status = opts?.status;
    this.kind = opts?.kind;
    this.retryAfterSeconds = opts?.retryAfterSeconds;
    this.body = opts?.body;
  }
}

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

/** Streaming path — SSE may emit one JSON plan event (current backend). */
export async function streamEditorCommand(
  request: EditorCommandRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void
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
          error?: string;
          kind?: string;
          status?: number | string;
          retry_after?: number;
        };
        if (obj.error) {
          const mapped = mapAiEditorError({
            status: typeof obj.status === "number" ? obj.status : 429,
            message: obj.error,
            kind: obj.kind,
            retryAfterSeconds: obj.retry_after,
            body: { detail: obj },
          });
          throw new AiEditorCommandError(mapped.message, {
            status: mapped.status,
            kind: mapped.kind,
            retryAfterSeconds: mapped.retryAfterSeconds,
            body: obj,
          });
        }
        parsed = obj;
        if (typeof obj.feedback === "string") {
          assembled = obj.feedback;
        } else if (typeof obj.message === "string") {
          assembled = obj.message;
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
