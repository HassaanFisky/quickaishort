import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface VideoMetadata {
  title?: string;
  duration: number;
}

interface VideoAnalysis {
  topics: string[];
  scenes: { time: number; description: string }[];
  transcript: { text: string; startTime: number; endTime: number }[];
}

const DEFAULT_SUGGESTIONS = [
  "Add captions from transcript",
  "Trim to highlight best moments",
  "Apply cinematic color grade",
  "Boost brightness +20%",
  "Remove intro silence",
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[/api/ai/suggestions] GEMINI_API_KEY not set");
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS });
  }

  let videoMetadata: VideoMetadata;
  let videoAnalysis: VideoAnalysis | null;

  try {
    ({ videoMetadata, videoAnalysis } = await req.json());
  } catch {
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
    });

    const prompt = `Video title: "${videoMetadata?.title ?? "Untitled"}"
Duration: ${Math.round(videoMetadata?.duration ?? 0)}s
Topics: ${videoAnalysis?.topics?.join(", ") || "unknown"}
Scene count: ${videoAnalysis?.scenes?.length ?? "unknown"}
Transcript available: ${videoAnalysis && videoAnalysis.transcript.length > 0 ? "yes" : "no"}

Return ONLY JSON: { "suggestions": ["action1", "action2", "action3", "action4", "action5"] }
Make suggestions specific to this video. Format: imperative verb + specific detail.
Examples: "Add captions to first 30 seconds", "Trim intro to 0:05", "Apply warm color grade for lifestyle content"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return NextResponse.json(
      { suggestions: parsed.suggestions || DEFAULT_SUGGESTIONS },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/ai/suggestions] Gemini call failed:", msg);
    return NextResponse.json({ suggestions: DEFAULT_SUGGESTIONS });
  }
}
