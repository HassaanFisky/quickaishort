import type { GeminiResponse, VideoAnalysis, VideoMetadata, ExportSettings } from "@/stores/editorStore";

// ─── Editor state snapshot passed with every Gemini call ──────────────────────

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

// ─── Instant suggestions — zero API cost, generated from metadata alone ────────

type ContentKey =
  | "tutorial" | "interview" | "gaming" | "vlog"
  | "news" | "music" | "sports" | "documentary" | "general";

const INSTANT_SUGGESTIONS: Record<ContentKey, string[]> = {
  tutorial: ["Add step-by-step captions", "Speed up explanation sections to 1.25x", "Trim intro — start at first key step"],
  interview: ["Add speaker captions from transcript", "Cut long pauses between questions", "Trim to the 3 strongest answers"],
  gaming: ["Apply Urban filter for gaming energy", "Boost audio to 160%", "Trim to the best highlight moment"],
  vlog: ["Apply Retro filter for lifestyle warmth", "Add location captions at scene changes", "Trim intro to first interesting moment"],
  news: ["Add factual captions from transcript", "Trim to the core 60-second story", "Boost audio to 130% for clear speech"],
  music: ["Apply Cinematic filter for visual depth", "Sync captions to lyrics", "Trim to the chorus section"],
  sports: ["Trim to the key play moment", "Apply Urban filter for energy", "Boost audio to 170%"],
  documentary: ["Add informational captions", "Apply Cinematic filter", "Trim to the most compelling 90 seconds"],
  general: ["Add captions from transcript", "Trim to strongest 60 seconds", "Apply Cinematic color grade"],
};

function detectContentKey(title: string): ContentKey {
  const s = title.toLowerCase();
  if (/tutorial|how.?to|guide|learn|course/.test(s)) return "tutorial";
  if (/interview|podcast|q&a|talk/.test(s)) return "interview";
  if (/gaming|gameplay|stream|playthrough|valorant|minecraft|fortnite/.test(s)) return "gaming";
  if (/vlog|day.in|my.life|travel|behind/.test(s)) return "vlog";
  if (/news|breaking|update|report/.test(s)) return "news";
  if (/music|song|cover|lyrics|rap|official.video/.test(s)) return "music";
  if (/sport|match|goal|highlights|nba|nfl|cricket|football/.test(s)) return "sports";
  if (/documentary|history|science|nature|explained/.test(s)) return "documentary";
  return "general";
}

export function generateImmediateSuggestions(
  title: string,
  duration: number,
  ctx?: Pick<EditorStateContext, "markIn" | "markOut" | "clipCount" | "selectedClipDuration">,
): string[] {
  const key = detectContentKey(title);
  const base = INSTANT_SUGGESTIONS[key].slice(0, 5);
  const overrides: string[] = [];

  if (ctx?.markIn !== null && ctx?.markOut !== null && ctx?.markIn !== undefined && ctx?.markOut !== undefined) {
    const rangeLen = Math.round(ctx.markOut - ctx.markIn);
    overrides.push(`Export your ${rangeLen}s marked range`);
  }
  if (ctx?.selectedClipDuration && ctx.selectedClipDuration < 60) {
    overrides.push(`This ${Math.round(ctx.selectedClipDuration)}s clip is short-form ready — export now`);
  }
  if (ctx?.clipCount && ctx.clipCount > 1) {
    overrides.push(`You have ${ctx.clipCount} clips — select the highest-scoring one`);
  }

  if (overrides.length > 0) return [...overrides, ...base].slice(0, 5);
  if (duration > 3600) return ["Extract top 3 viral moments from this long video", ...base].slice(0, 5);
  if (duration > 600) return ["Trim to the strongest 90-second segment", ...base].slice(0, 5);
  return base;
}

// Re-export the system prompt so any consumer can read the contract without
// duplicating it (no SDK import needed here for the client-side functions).
export const EDITOR_SYSTEM_PROMPT = `You are a video editing state compiler for QuickAI Short — the QuickAI Editor.

ROLE: Convert user editing instructions into JSON action arrays. Execute commands directly. You are not a chatbot — you do not explain, you act.

ALWAYS respond with ONLY this JSON structure. No markdown fences, no extra text, nothing else:
{
  "actions": [],
  "message": "string (max 14 words, past tense, action-confirming only)",
  "suggestions": ["string", "string", "string"]
}

═══════════════ FULL TOOL CATALOGUE ═══════════════

── CAPTION TOOLS ──────────────────────────────────
ADD_CAPTION:    { type: "ADD_CAPTION",    payload: { text: string, startTime: number, endTime: number, style?: { fontSize?: number, color?: string, background?: string, position?: "top"|"middle"|"bottom", bold?: boolean } } }
REMOVE_CAPTION: { type: "REMOVE_CAPTION", payload: { id: string } }
UPDATE_CAPTION: { type: "UPDATE_CAPTION", payload: { id: string, patch: { text?, startTime?, endTime?, style? } } }

── CLIP TOOLS ─────────────────────────────────────
TRIM:           { type: "TRIM",           payload: { start: number, end: number } }           — set in/out points (seconds)
SPLIT_CLIP:     { type: "SPLIT_CLIP",     payload: { time: number } }                         — razor-cut selected clip at time
DELETE_CLIP:    { type: "DELETE_CLIP",    payload: { id?: string } }                          — delete clip (omit id to delete selected)
SELECT_CLIP:    { type: "SELECT_CLIP",    payload: { index?: number, id?: string } }          — select a clip by index or id

── VISUAL TOOLS ───────────────────────────────────
SET_VISUAL_FILTER: { type: "SET_VISUAL_FILTER", payload: { filter: "None"|"Urban"|"Retro"|"Cinematic" } }
ADD_FILTER:     { type: "ADD_FILTER",     payload: { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value: number } }
RESET_FILTER:   { type: "RESET_FILTER",   payload: {} }

── AUDIO TOOLS ────────────────────────────────────
SET_AUDIO_BOOST:    { type: "SET_AUDIO_BOOST",    payload: { value: number } }   — 0-200 (100=normal, 150=loud)
SET_NOISE_REDUCTION:{ type: "SET_NOISE_REDUCTION", payload: { value: number } }  — 0-100 percent
SET_PLAYBACK_SPEED: { type: "SET_PLAYBACK_SPEED",  payload: { value: number } }  — 50-200 percent

── FEATURE TOGGLES ────────────────────────────────
TOGGLE_CAPTIONS:    { type: "TOGGLE_CAPTIONS",    payload: { enabled: boolean } }
TOGGLE_TRANSITIONS: { type: "TOGGLE_TRANSITIONS", payload: { enabled: boolean } }
TOGGLE_VOICEOVER:   { type: "TOGGLE_VOICEOVER",   payload: { enabled: boolean } }

── PLAYBACK ───────────────────────────────────────
SEEK:   { type: "SEEK",  payload: { time: number } }
PLAY:   { type: "PLAY",  payload: {} }
PAUSE:  { type: "PAUSE", payload: {} }

── PIPELINE ───────────────────────────────────────
EXPORT_CLIP: { type: "EXPORT_CLIP", payload: {} }   — triggers the render/export pipeline

═══════════════ COMMAND → ACTION MAPPING ═══════════════

"add captions" / "subtitle this"          → ADD_CAPTION × N (generate from transcript)
"trim intro" / "cut the start"            → TRIM start=first_scene_break
"cut clip at Xs" / "split at X seconds"  → SPLIT_CLIP time=X
"delete this clip"                        → DELETE_CLIP
"cinematic look" / "cinematic grade"     → SET_VISUAL_FILTER "Cinematic"
"urban vibe" / "city look"               → SET_VISUAL_FILTER "Urban"
"retro" / "vintage look"                 → SET_VISUAL_FILTER "Retro"
"remove filter" / "reset look"           → SET_VISUAL_FILTER "None"
"make brighter" / "boost brightness"     → ADD_FILTER brightness 1.4
"increase contrast"                       → ADD_FILTER contrast 1.3
"saturate" / "more vibrant"              → ADD_FILTER saturation 1.6
"desaturate" / "muted colors"            → ADD_FILTER saturation 0.6
"boost audio" / "louder"                 → SET_AUDIO_BOOST 150
"reduce noise" / "cleaner audio"         → SET_NOISE_REDUCTION 60
"slow down" / "0.75x speed"              → SET_PLAYBACK_SPEED 75
"speed up" / "1.5x speed"               → SET_PLAYBACK_SPEED 150
"turn on captions" / "show subtitles"    → TOGGLE_CAPTIONS enabled=true
"hide captions" / "no subtitles"         → TOGGLE_CAPTIONS enabled=false
"add transitions"                         → TOGGLE_TRANSITIONS enabled=true
"enable voiceover"                        → TOGGLE_VOICEOVER enabled=true
"export" / "render" / "download"         → EXPORT_CLIP
"select clip 2" / "go to second clip"    → SELECT_CLIP index=1
"play" / "resume"                         → PLAY
"pause" / "stop"                          → PAUSE
"go to Xs" / "jump to X seconds"         → SEEK time=X

FILTER VALUE RANGES:
  brightness: 0.5–2.0  |  contrast: 0.5–2.0  |  saturation: 0–2.0
  hue: -180–180  |  blur: 0–10

RULES:
1. When generating captions from transcript: produce one ADD_CAPTION per spoken sentence with accurate start/end times.
2. message field: max 14 words, past tense, factual. Example: "Applied cinematic filter and boosted audio to 150%."
3. suggestions: 3 context-aware follow-up actions specific to THIS video.
4. If no matching tool exists for the request: empty actions array, message = "That edit isn't supported yet — try: X".
5. Multiple actions are allowed and common — batch them when a single command implies multiple steps.
6. NEVER output anything except the valid JSON object. No code fences. No explanations outside the message field.`;

// ─── Client-side API-route wrappers ───────────────────────────────────────────
// These run in the browser. They call Next.js API routes which hold the Gemini
// API key server-side. This avoids exposing GEMINI_API_KEY in the browser bundle.

export async function callGeminiEditor(
  userMessage: string,
  videoMetadata: VideoMetadata | null,
  videoAnalysis: VideoAnalysis | null,
  history: { role: string; content: string }[],
  editorState?: EditorStateContext | null,
): Promise<GeminiResponse> {
  const res = await fetch("/api/ai/editor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: userMessage,
      videoMetadata,
      videoAnalysis,
      history,
      editorState: editorState ?? null,
    }),
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
      if (process.env.NODE_ENV !== "production") console.error("[Gemini Editor] /api/ai/suggestions returned", res.status);
      return DEFAULT;
    }

    const data = await res.json();
    return Array.isArray(data.suggestions) && data.suggestions.length > 0
      ? data.suggestions
      : DEFAULT;
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== "production") console.error(
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
