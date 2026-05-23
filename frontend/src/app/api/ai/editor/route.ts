import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

// ─── Types (inline to avoid importing client-only stores server-side) ──────────
interface VideoMetadata {
  id?: string;
  url?: string;
  title?: string;
  duration: number;
  nativeWidth: number;
  nativeHeight: number;
  fps?: number;
}

interface VideoAnalysis {
  scenes: { time: number; description: string }[];
  transcript: { text: string; startTime: number; endTime: number }[];
  topics: string[];
  suggestedEdits: string[];
}

interface GeminiResponse {
  actions: { type: string; payload: Record<string, unknown> }[];
  message: string;
  suggestions: string[];
}

// ─── System prompt ─────────────────────────────────────────────────────────────
const EDITOR_SYSTEM_PROMPT = `You are a video editing state compiler for QuickAI Short.

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

function buildVideoContext(meta: VideoMetadata | null, analysis: VideoAnalysis | null): string {
  if (!meta) return "No video loaded.";
  const parts = [
    `Title: ${meta.title ?? "Untitled"}`,
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

// ─── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[/api/ai/editor] GEMINI_API_KEY not set");
    return NextResponse.json(
      { error: "Gemini API key not configured on server" },
      { status: 503 },
    );
  }

  let message: string;
  let videoMetadata: VideoMetadata | null;
  let videoAnalysis: VideoAnalysis | null;
  let history: { role: string; content: string }[];

  try {
    ({ message, videoMetadata, videoAnalysis, history } = await req.json());
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
        EDITOR_SYSTEM_PROMPT + "\n\nVIDEO DATA:\n" + buildVideoContext(videoMetadata, videoAnalysis),
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    });

    // Build strictly alternating chat history (must end with model turn)
    const rawMapped = (history ?? []).slice(-10).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("model" as const),
      parts: [{ text: m.content }],
    }));
    const chatHistory: typeof rawMapped = [];
    for (const msg of rawMapped) {
      if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== msg.role) {
        chatHistory.push(msg);
      }
    }
    while (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === "user") {
      chatHistory.pop();
    }

    // Google AI requires history to start with a "user" turn (Bug 7)
    while (chatHistory.length > 0 && chatHistory[0].role !== "user") {
      chatHistory.shift();
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(message);
    const raw = result.response.text().trim();

    const cleaned = raw.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed: GeminiResponse = JSON.parse(cleaned);
    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/ai/editor] Gemini call failed:", msg);

    if (/API_KEY|401|403/i.test(msg)) {
      return NextResponse.json({ error: "Gemini API key invalid or unauthorized" }, { status: 401 });
    }
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      return NextResponse.json({ error: "Gemini rate limit reached" }, { status: 429 });
    }
    if (/JSON|parse/i.test(msg)) {
      return NextResponse.json(
        { actions: [], message: "Response format error — try rephrasing.", suggestions: [] },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
