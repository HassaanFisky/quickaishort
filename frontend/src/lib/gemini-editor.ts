import type { GeminiResponse, VideoAnalysis, VideoMetadata } from "@/stores/editorStore";

// Re-export the system prompt so any consumer can read the contract without
// duplicating it (no SDK import needed here for the client-side functions).
export const EDITOR_SYSTEM_PROMPT = `You are a video editing state compiler for QuickAI Short.

ROLE: Convert user editing instructions into JSON action arrays. You are not a chatbot. You do not explain yourself. You execute.

ALWAYS respond with ONLY this JSON structure — nothing else, no markdown fences:
{
  "actions": [],
  "message": "string (max 12 words, past tense, action-confirming only)",
  "suggestions": ["string", "string", "string"]
}

ACTION TYPES (use exact type strings):
ADD_CAPTION:    { type: "ADD_CAPTION", payload: { text, startTime, endTime, style?: { fontSize, color, background, position:"top"|"middle"|"bottom", bold } } }
REMOVE_CAPTION: { type: "REMOVE_CAPTION", payload: { id } }
UPDATE_CAPTION: { type: "UPDATE_CAPTION", payload: { id, patch: { text?, startTime?, endTime?, style? } } }
TRIM:           { type: "TRIM", payload: { start, end } }
ADD_FILTER:     { type: "ADD_FILTER", payload: { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value: number } }
RESET_FILTER:   { type: "RESET_FILTER", payload: {} }
SEEK:           { type: "SEEK", payload: { time: number (seconds) } }
PLAY:           { type: "PLAY", payload: {} }
PAUSE:          { type: "PAUSE", payload: {} }

FILTER RANGES: brightness 0.5-2.0, contrast 0.5-2.0, saturation 0-2.0, hue -180 to 180, blur 0-10

RULES:
1. Generate captions from transcript when user says "add captions" or "subtitle this"
2. For "trim intro" — use first scene break as end point for trimming start
3. For "make it brighter" — ADD_FILTER brightness 1.4
4. For "cinematic" — ADD_FILTER contrast 1.2, saturation 0.85, brightness 0.95
5. For "vibrant" — ADD_FILTER saturation 1.6, brightness 1.05
6. For "vintage" — ADD_FILTER saturation 0.6, hue 15, brightness 0.9
7. message field: factual, max 12 words. Example: "Added 8 captions from transcript."
8. suggestions: 3 concrete next actions relevant to THIS video content
9. If user asks something outside your action scope: return empty actions array, message explaining limitation in 12 words
10. NEVER output anything except the JSON object`;

// ─── Client-side API-route wrappers ───────────────────────────────────────────
// These run in the browser. They call Next.js API routes which hold the Gemini
// API key server-side. This avoids exposing GEMINI_API_KEY in the browser bundle.

export async function callGeminiEditor(
  userMessage: string,
  videoMetadata: VideoMetadata | null,
  videoAnalysis: VideoAnalysis | null,
  history: { role: string; content: string }[],
): Promise<GeminiResponse> {
  const res = await fetch("/api/ai/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userMessage, videoMetadata, videoAnalysis, history }),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) errMsg = body.error;
    } catch {
      // ignore parse error, use HTTP status as message
    }
    throw new Error(errMsg);
  }

  return res.json() as Promise<GeminiResponse>;
}

export async function getInitialSuggestions(
  videoMetadata: VideoMetadata,
  videoAnalysis: VideoAnalysis | null,
): Promise<string[]> {
  const DEFAULT = [
    "Add captions from transcript",
    "Trim to highlight best moments",
    "Apply cinematic color grade",
    "Boost brightness +20%",
    "Remove intro silence",
  ];

  try {
    const res = await fetch("/api/ai/suggestions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoMetadata, videoAnalysis }),
    });

    if (!res.ok) {
      console.error("[Gemini Editor] /api/ai/suggestions returned", res.status);
      return DEFAULT;
    }

    const data = await res.json();
    return Array.isArray(data.suggestions) && data.suggestions.length > 0
      ? data.suggestions
      : DEFAULT;
  } catch (err: unknown) {
    console.error(
      "[Gemini Editor] getInitialSuggestions fetch failed:",
      err instanceof Error ? err.message : String(err),
    );
    return DEFAULT;
  }
}

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
    console.error("[Gemini Editor] analyzeVideoWithGemini: no API key");
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
    console.error(
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
