import { GoogleGenerativeAI } from "@google/generative-ai";
import type { GeminiResponse, VideoAnalysis, VideoMetadata } from "@/stores/editorStore";

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY!);

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

export async function callGeminiEditor(
  userMessage: string,
  videoMetadata: VideoMetadata | null,
  videoAnalysis: VideoAnalysis | null,
  history: { role: string; content: string }[],
): Promise<GeminiResponse> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  const videoContext = buildVideoContext(videoMetadata, videoAnalysis);

  const chatHistory = history.slice(-10).map((m) => ({
    role: m.role === "user" ? "user" : ("model" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: [
      {
        role: "user",
        parts: [{ text: EDITOR_SYSTEM_PROMPT + "\n\nVIDEO DATA:\n" + videoContext }],
      },
      {
        role: "model",
        parts: [
          {
            text: JSON.stringify({
              actions: [],
              message: "Ready. Video loaded and analyzed.",
              suggestions: videoAnalysis?.suggestedEdits?.slice(0, 3) || [
                "Add auto-captions from transcript",
                "Trim intro to first scene break",
                "Apply cinematic color grade",
              ],
            }),
          },
        ],
      },
      ...chatHistory,
    ],
  });

  const result = await chat.sendMessage(userMessage);
  const text = result.response.text().trim();

  try {
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      actions: [],
      message: "Could not parse response. Please try again.",
      suggestions: [],
    };
  }
}

export async function getInitialSuggestions(
  videoMetadata: VideoMetadata,
  videoAnalysis: VideoAnalysis | null,
): Promise<string[]> {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
  });

  const prompt = `Video title: "${videoMetadata.title}"
Duration: ${Math.round(videoMetadata.duration)}s
Topics: ${videoAnalysis?.topics?.join(", ") || "unknown"}
Scene count: ${videoAnalysis?.scenes?.length || "unknown"}
Transcript available: ${videoAnalysis && videoAnalysis.transcript.length > 0 ? "yes" : "no"}

Return ONLY JSON: { "suggestions": ["action1", "action2", "action3", "action4", "action5"] }
Make suggestions specific to this video. Format: imperative verb + specific detail.
Examples: "Add captions to first 30 seconds", "Trim intro to 0:05", "Apply warm color grade for lifestyle content"`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed.suggestions || [];
  } catch {
    return [
      "Add captions from transcript",
      "Trim to highlight best moments",
      "Apply cinematic color grade",
      "Boost brightness +20%",
      "Remove intro silence",
    ];
  }
}

export async function analyzeVideoWithGemini(
  videoUrl: string,
  videoTitle: string,
): Promise<Pick<VideoAnalysis, "topics" | "suggestedEdits">> {
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

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
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

function buildVideoContext(
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
    if (analysis.scenes.length > 0) {
      parts.push(`Scenes: ${JSON.stringify(analysis.scenes.slice(0, 15))}`);
    }
    if (analysis.transcript.length > 0) {
      parts.push(`Transcript: ${JSON.stringify(analysis.transcript.slice(0, 25))}`);
    }
    if (analysis.topics.length > 0) {
      parts.push(`Topics: ${analysis.topics.join(", ")}`);
    }
  }

  return parts.join("\n");
}
