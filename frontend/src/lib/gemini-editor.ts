import type { VideoAnalysis, VideoMetadata, ExportSettings } from "@/stores/editorStore";

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

// ─── Server-side helper (called only from Next.js API routes) ─────────────────
// analyzeVideoWithGemini is imported by /api/analyze-video/route.ts which runs
// server-side, so it can read GEMINI_API_KEY directly.

export async function analyzeVideoWithGemini(
  videoUrl: string,
  videoTitle: string,
): Promise<Pick<VideoAnalysis, "topics" | "suggestedEdits">> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") console.error("[Gemini Editor] analyzeVideoWithGemini: no API key");
    return { topics: ["video", "content"], suggestedEdits: [] };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });

  const prompt = `You are a video analysis assistant. Based on this video URL and title, provide editing suggestions.

Video URL: ${videoUrl}
Video Title: ${videoTitle}

Return ONLY this JSON:
{
  "topics": ["topic1", "topic2", "topic3"],
  "suggestedEdits": ["edit1", "edit2", "edit3", "edit4", "edit5"]
}

topics: 3-5 content topics inferred from the title
suggestedEdits: 5 specific, actionable editing suggestions based on likely content`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== "production") console.error(
      "[Gemini Editor] analyzeVideoWithGemini failed:",
      err instanceof Error ? err.message : String(err),
    );
    return {
      topics: ["video", "content"],
      suggestedEdits: [
        "Add captions for accessibility",
        "Apply cinematic color grade",
        "Trim intro to first 5 seconds",
        "Boost audio levels",
        "Add end card overlay",
      ],
    };
  }
}

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

export interface EditorCommandRequest {
  command: string
  user_tier?: "free" | "pro"
  project_context?: Record<string, unknown>
  stream?: boolean
}

// Main function — send command, get back tool actions
export async function sendEditorCommand(
  request: EditorCommandRequest
): Promise<EditorCommandResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof window !== "undefined") {
    try {
      const { getSession } = await import("next-auth/react");
      const session = await getSession();
      if (session?.backendToken) {
        headers["Authorization"] = `Bearer ${session.backendToken}`;
      }
      if (session?.user?.id) {
        headers["X-User-Id"] = session.user.id;
      }
    } catch {}
  }

  const response = await fetch(`${API_BASE}/api/ai-editor/command`, {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      error.detail || `AI Editor error: ${response.status}`
    )
  }

  return response.json()
}

// Streaming version — for real-time typing effect
export async function streamEditorCommand(
  request: EditorCommandRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (typeof window !== "undefined") {
    try {
      const { getSession } = await import("next-auth/react");
      const session = await getSession();
      if (session?.backendToken) {
        headers["Authorization"] = `Bearer ${session.backendToken}`;
      }
      if (session?.user?.id) {
        headers["X-User-Id"] = session.user.id;
      }
    } catch {}
  }

  const response = await fetch(`${API_BASE}/api/ai-editor/command/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...request, stream: true }),
  })

  if (!response.ok) throw new Error(`Stream error: ${response.status}`)
  if (!response.body) throw new Error("No response body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      onDone()
      break
    }
    const chunk = decoder.decode(value)
    const lines = chunk.split("\n")
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        onChunk(line.replace("data: ", ""))
      }
    }
  }
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

