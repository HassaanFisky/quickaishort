import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Inline types (server-side only — cannot import client stores) ─────────────

interface VideoMetadata {
  id?: string;
  title?: string;
  duration: number;
  nativeWidth: number;
  nativeHeight: number;
}

interface VideoAnalysis {
  scenes: { time: number; description: string }[];
  transcript: { text: string; startTime: number; endTime: number }[];
  topics: string[];
  suggestedEdits: string[];
}

interface EditorStateContext {
  clipIndex: number | null;
  clipStart: number | null;
  clipEnd: number | null;
  totalClips: number;
  videoDuration: number;
  filter: string;
  audioBoost: number;
  playbackSpeed: number;
  noiseSuppression: number;
  captionsEnabled: boolean;
  captionCount: number;
  transitionEnabled: boolean;
  voiceoverEnabled: boolean;
  recentActions: string[];
}

interface GeminiResponse {
  actions: { type: string; payload: Record<string, unknown> }[];
  message: string;
  suggestions: string[];
}

// ─── Smart context builder ─────────────────────────────────────────────────────

function sampleTranscript(
  transcript: { text: string; startTime: number; endTime: number }[],
  clipStart: number | null,
  clipEnd: number | null,
  maxWords = 200,
): string {
  if (!transcript?.length) return "";

  // Prefer transcript within the selected clip
  const focused = clipStart != null && clipEnd != null
    ? transcript.filter((c) => c.startTime >= clipStart && c.endTime <= clipEnd)
    : [];

  const source = focused.length >= 3 ? focused : transcript;

  // Smart sampling: take from beginning, middle, and end
  let sample: typeof transcript;
  if (source.length <= 25) {
    sample = source;
  } else {
    const third = Math.floor(source.length / 3);
    sample = [
      ...source.slice(0, 8),
      ...source.slice(third - 3, third + 3),
      ...source.slice(source.length - 8),
    ];
  }

  const words = sample.map((c) => c.text).join(" ").split(/\s+/);
  return words.slice(0, maxWords).join(" ");
}

function buildSmartContext(
  meta: VideoMetadata | null,
  analysis: VideoAnalysis | null,
  state: EditorStateContext | null,
): string {
  if (!meta) return "No video loaded.";

  const durationMin = Math.round((meta.duration ?? 0) / 60);
  const lines: string[] = [
    `TITLE: ${meta.title ?? "Untitled"}`,
    `DURATION: ${durationMin}m (${Math.round(meta.duration ?? 0)}s) | ${meta.nativeWidth}x${meta.nativeHeight}`,
  ];

  // Topics
  if (analysis?.topics?.length) {
    lines.push(`TOPICS: ${analysis.topics.slice(0, 5).join(", ")}`);
  }

  // Scene markers (limit to 8 for token efficiency)
  if (analysis?.scenes?.length) {
    const scenes = analysis.scenes.slice(0, 8).map((s) => `${s.time}s: ${s.description}`);
    lines.push(`SCENES: ${scenes.join(" | ")}`);
  }

  // Transcript sample — token-efficient
  const transcriptSample = sampleTranscript(
    analysis?.transcript ?? [],
    state?.clipStart ?? null,
    state?.clipEnd ?? null,
  );
  if (transcriptSample) {
    lines.push(`TRANSCRIPT SAMPLE: "${transcriptSample}"`);
  }

  // Current editor state (ultra-compact)
  if (state) {
    const clipInfo =
      state.clipStart != null
        ? `clip ${(state.clipIndex ?? 0) + 1}/${state.totalClips} [${Math.round(state.clipStart)}s–${Math.round(state.clipEnd ?? 0)}s]`
        : `${state.totalClips} clips, none selected`;

    const settings: string[] = [];
    if (state.filter !== "None") settings.push(`filter=${state.filter}`);
    if (state.audioBoost !== 100) settings.push(`audio=${state.audioBoost}%`);
    if (state.playbackSpeed !== 100) settings.push(`speed=${state.playbackSpeed}%`);
    if (state.noiseSuppression > 0) settings.push(`noise-reduction=${state.noiseSuppression}%`);
    if (state.captionCount > 0) settings.push(`captions=${state.captionCount}`);
    if (state.transitionEnabled) settings.push("transitions=ON");
    if (state.voiceoverEnabled) settings.push("voiceover=ON");

    lines.push(`CURRENT STATE: ${clipInfo}${settings.length ? " | " + settings.join(", ") : ""}`);

    if (state.recentActions.length) {
      lines.push(`RECENT ACTIONS: ${state.recentActions.slice(-6).join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ─── Full 20-tool system prompt ────────────────────────────────────────────────

const EDITOR_SYSTEM_PROMPT = `You are the QuickAI Editor — a video editing intelligence for QuickAI Short.

ROLE: Convert natural language editing commands into precise JSON action arrays. You are not a chatbot. You execute. You remember what you've done (see RECENT ACTIONS in context). You are aware of the current editor state (see CURRENT STATE in context).

ALWAYS respond with ONLY this exact JSON — no markdown, no prose, nothing else:
{
  "actions": [],
  "message": "string (max 14 words, past tense, specific: 'Applied Cinematic filter and boosted audio to 150%.')",
  "suggestions": ["verb + detail", "verb + detail", "verb + detail"]
}

═══════════════════ TOOL CATALOGUE ═══════════════════

── CAPTION TOOLS ──────────────────────────────────────
ADD_CAPTION     { type: "ADD_CAPTION",    payload: { text, startTime, endTime, style?: { fontSize?, color?, background?, position?: "top"|"middle"|"bottom", bold? } } }
REMOVE_CAPTION  { type: "REMOVE_CAPTION", payload: { id } }
UPDATE_CAPTION  { type: "UPDATE_CAPTION", payload: { id, patch: { text?, startTime?, endTime?, style? } } }

── CLIP TOOLS ─────────────────────────────────────────
TRIM            { type: "TRIM",           payload: { start: number, end: number } }
SPLIT_CLIP      { type: "SPLIT_CLIP",     payload: { time: number } }
DELETE_CLIP     { type: "DELETE_CLIP",    payload: { id?: string } }
SELECT_CLIP     { type: "SELECT_CLIP",    payload: { index?: number, id?: string } }

── VISUAL TOOLS ───────────────────────────────────────
SET_VISUAL_FILTER  { type: "SET_VISUAL_FILTER", payload: { filter: "None"|"Urban"|"Retro"|"Cinematic" } }
ADD_FILTER      { type: "ADD_FILTER",     payload: { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value: number } }
RESET_FILTER    { type: "RESET_FILTER",   payload: {} }

── AUDIO TOOLS ────────────────────────────────────────
SET_AUDIO_BOOST     { type: "SET_AUDIO_BOOST",     payload: { value: number } }   // 0-200
SET_NOISE_REDUCTION { type: "SET_NOISE_REDUCTION",  payload: { value: number } }   // 0-100
SET_PLAYBACK_SPEED  { type: "SET_PLAYBACK_SPEED",   payload: { value: number } }   // 50-200

── FEATURE TOGGLES ────────────────────────────────────
TOGGLE_CAPTIONS     { type: "TOGGLE_CAPTIONS",     payload: { enabled: boolean } }
TOGGLE_TRANSITIONS  { type: "TOGGLE_TRANSITIONS",  payload: { enabled: boolean } }
TOGGLE_VOICEOVER    { type: "TOGGLE_VOICEOVER",    payload: { enabled: boolean } }

── PLAYBACK ───────────────────────────────────────────
SEEK    { type: "SEEK",  payload: { time: number } }
PLAY    { type: "PLAY",  payload: {} }
PAUSE   { type: "PAUSE", payload: {} }

── PIPELINE ───────────────────────────────────────────
EXPORT_CLIP  { type: "EXPORT_CLIP", payload: {} }

═══════════════════ COMMAND → ACTION MAP ═══════════════════

"add captions"/"subtitle"          → ADD_CAPTION × N (from transcript, one per sentence)
"trim intro"/"cut the start"       → TRIM start=scene_break_time
"split at X"/"cut at X seconds"    → SPLIT_CLIP time=X
"delete clip"                      → DELETE_CLIP
"cinematic"/"film look"            → SET_VISUAL_FILTER "Cinematic"
"urban"/"street vibe"              → SET_VISUAL_FILTER "Urban"
"retro"/"vintage"                  → SET_VISUAL_FILTER "Retro"
"remove filter"/"reset look"       → SET_VISUAL_FILTER "None"
"brighter"/"more light"            → ADD_FILTER brightness 1.4
"more contrast"                    → ADD_FILTER contrast 1.3
"vibrant"/"saturated"              → ADD_FILTER saturation 1.6
"muted"/"desaturate"               → ADD_FILTER saturation 0.6
"louder"/"boost audio"             → SET_AUDIO_BOOST 150
"reduce noise"/"cleaner audio"     → SET_NOISE_REDUCTION 65
"slow down"/"0.75x"                → SET_PLAYBACK_SPEED 75
"speed up"/"1.5x"                  → SET_PLAYBACK_SPEED 150
"show captions"                    → TOGGLE_CAPTIONS enabled=true
"hide captions"                    → TOGGLE_CAPTIONS enabled=false
"add transitions"                  → TOGGLE_TRANSITIONS enabled=true
"voiceover on"                     → TOGGLE_VOICEOVER enabled=true
"export"/"render"/"download"       → EXPORT_CLIP
"select clip 2"                    → SELECT_CLIP index=1
"play"/"resume"                    → PLAY
"pause"/"stop"                     → PAUSE
"go to X seconds"                  → SEEK time=X

ADD_FILTER RANGES: brightness 0.5–2.0 | contrast 0.5–2.0 | saturation 0–2.0 | hue -180–180 | blur 0–10

INTELLIGENCE RULES:
1. Batch multiple actions when one command implies several steps.
2. When user says "undo" or "revert" — RESET_FILTER if a filter was applied, or describe limit.
3. For long videos (>30 min), work with timestamps rather than full transcript.
4. Suggestions must be 3 specific, actionable follow-ups for THIS exact video — not generic.
5. If unsure of a clip id, use DELETE_CLIP without id (targets selected clip).
6. NEVER return partial JSON. NEVER add prose outside the JSON.
7. If request is impossible: empty actions, honest message explaining what CAN be done instead.`;

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Gemini API key not configured on this server." },
      { status: 503 },
    );
  }

  let message: string;
  let videoMetadata: VideoMetadata | null = null;
  let videoAnalysis: VideoAnalysis | null = null;
  let editorState: EditorStateContext | null = null;
  let history: { role: string; content: string }[] = [];

  try {
    const body = await req.json();
    message = body.message;
    videoMetadata = body.videoMetadata ?? null;
    videoAnalysis = body.videoAnalysis ?? null;
    editorState = body.editorState ?? null;
    history = body.history ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction:
        EDITOR_SYSTEM_PROMPT +
        "\n\n════ VIDEO & EDITOR CONTEXT ════\n" +
        buildSmartContext(videoMetadata, videoAnalysis, editorState),
      generationConfig: {
        temperature: 0.1,          // low = consistent, deterministic tool calls
        responseMimeType: "application/json",
      },
    });

    // Build strictly alternating chat history — Gemini requires user/model alternation
    // Keep last 8 exchanges (16 messages) to stay token-efficient
    const rawHistory = (history ?? []).slice(-16).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));

    const chatHistory: typeof rawHistory = [];
    for (const msg of rawHistory) {
      const last = chatHistory[chatHistory.length - 1];
      if (!last || last.role !== msg.role) chatHistory.push(msg);
    }
    // Must start with user, end with model
    while (chatHistory.length > 0 && chatHistory[0].role !== "user") chatHistory.shift();
    while (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "user") chatHistory.pop();

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(message);
    const raw = result.response.text().trim();
    const cleaned = raw.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed: GeminiResponse = JSON.parse(cleaned);

    return NextResponse.json(parsed, {
      headers: { "Cache-Control": "private, no-cache" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/ai/editor] Gemini call failed:", msg);

    if (/API_KEY|401|403/i.test(msg))
      return NextResponse.json({ error: "Gemini API key invalid or unauthorized." }, { status: 401 });
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg))
      return NextResponse.json({ error: "Gemini rate limit reached — please wait a moment." }, { status: 429 });
    if (/JSON|parse|SyntaxError/i.test(msg))
      return NextResponse.json(
        { actions: [], message: "Response parsing failed — try rephrasing.", suggestions: [] },
        { status: 200 },
      );

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
