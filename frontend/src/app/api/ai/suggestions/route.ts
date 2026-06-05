import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface VideoMetadata {
  title?: string;
  duration: number;
}

interface VideoAnalysis {
  topics: string[];
  transcript: { text: string; startTime: number; endTime: number }[];
}

// ─── Instant content-type classifier (zero API cost) ──────────────────────────

type ContentType =
  | "tutorial"
  | "interview"
  | "gaming"
  | "vlog"
  | "news"
  | "music"
  | "sports"
  | "documentary"
  | "general";

function classifyContent(title: string, topics: string[]): ContentType {
  const s = (title + " " + topics.join(" ")).toLowerCase();
  if (/tutorial|how to|guide|step.by.step|learn|course/.test(s)) return "tutorial";
  if (/interview|podcast|conversation|talk|q&a|discussion/.test(s)) return "interview";
  if (/gaming|gameplay|game|stream|playthrough|valorant|minecraft|fortnite/.test(s)) return "gaming";
  if (/vlog|day in|my life|week with|travel|behind the scene/.test(s)) return "vlog";
  if (/news|update|breaking|report|today|happening/.test(s)) return "news";
  if (/music|song|cover|lyrics|beat|rap|official video/.test(s)) return "music";
  if (/sport|match|game|goal|highlights|nba|nfl|cricket|football|soccer/.test(s)) return "sports";
  if (/documentary|history|science|nature|explained|why|what is/.test(s)) return "documentary";
  return "general";
}

const SUGGESTIONS_BY_TYPE: Record<ContentType, string[]> = {
  tutorial: [
    "Add step-by-step captions for each section",
    "Speed up slow explanation parts to 1.25x",
    "Trim intro — start at first key step",
    "Boost audio clarity with noise reduction",
    "Apply clean Urban filter for screen content",
  ],
  interview: [
    "Add speaker captions from transcript",
    "Cut long pauses between questions",
    "Trim to the 3 strongest answers",
    "Boost audio to 140% — interview audio is often quiet",
    "Enable crossfade transitions between cuts",
  ],
  gaming: [
    "Apply Urban filter for high-energy gaming vibe",
    "Boost audio to 160% — gaming clips hit harder loud",
    "Trim to the best highlight moment",
    "Add captions for commentary",
    "Speed up slow lobby/loading sections",
  ],
  vlog: [
    "Apply warm Retro filter for lifestyle feel",
    "Add location captions at each new scene",
    "Trim intro to first interesting moment",
    "Enable crossfade transitions between scenes",
    "Boost audio and reduce background noise",
  ],
  news: [
    "Add factual captions from transcript",
    "Apply clean color grade — no filters",
    "Trim to core 60-second story",
    "Boost audio to 130% for clear speech",
    "Trim outro — end on strongest point",
  ],
  music: [
    "Apply Cinematic filter for visual depth",
    "Sync captions to lyrics from transcript",
    "Trim to the chorus — highest energy section",
    "Boost audio to 180% for impact",
    "Reduce noise suppression — preserve the music",
  ],
  sports: [
    "Trim to the key play or highlight moment",
    "Apply Urban filter for stadium energy",
    "Boost audio to 170% — crowd energy matters",
    "Add captions for commentary highlights",
    "Speed up build-up, keep the moment in full",
  ],
  documentary: [
    "Add informational captions from transcript",
    "Apply Cinematic filter for film quality",
    "Trim to the most compelling 90 seconds",
    "Enable AI voiceover for narration",
    "Add crossfade transitions between scenes",
  ],
  general: [
    "Add captions from transcript",
    "Trim to the strongest 60 seconds",
    "Apply Cinematic color grade",
    "Boost audio to 130% for clarity",
    "Enable crossfade transitions",
  ],
};

function getDurationSuggestions(duration: number): string[] {
  if (duration > 3600) {
    return [
      "Extract top 3 viral moments from this long video",
      "Trim to a 60-second highlight reel",
    ];
  }
  if (duration > 600) {
    return [
      "Trim to the strongest 90-second segment",
    ];
  }
  return [];
}

function buildInstantSuggestions(
  title: string,
  duration: number,
  topics: string[],
): string[] {
  const contentType = classifyContent(title, topics);
  const base = SUGGESTIONS_BY_TYPE[contentType].slice(0, 5);
  const durationExtras = getDurationSuggestions(duration);
  // Merge duration-specific ones at the top
  const merged = [...durationExtras, ...base];
  return merged.slice(0, 6);
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let videoMetadata: VideoMetadata;
  let videoAnalysis: VideoAnalysis | null;

  try {
    ({ videoMetadata, videoAnalysis } = await req.json());
  } catch {
    return NextResponse.json({ suggestions: SUGGESTIONS_BY_TYPE.general });
  }

  const title = videoMetadata?.title ?? "";
  const duration = videoMetadata?.duration ?? 0;
  const topics = videoAnalysis?.topics ?? [];

  // Always return instant suggestions immediately — zero API cost
  const instant = buildInstantSuggestions(title, duration, topics);

  // Try to refine with Gemini only if we have transcript AND API key
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.NEXT_PUBLIC_GEMINI_API_KEY;
  const hasTranscript = (videoAnalysis?.transcript?.length ?? 0) > 0;

  if (!apiKey || !hasTranscript) {
    return NextResponse.json(
      { suggestions: instant },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { temperature: 0.25, responseMimeType: "application/json" },
    });

    // Send a concise prompt — token efficient
    const transcriptSample = (videoAnalysis?.transcript ?? [])
      .slice(0, 12)
      .map((c) => c.text)
      .join(" ")
      .slice(0, 300);

    const prompt = `Video: "${title}" | ${Math.round(duration / 60)}min | Topics: ${topics.slice(0, 4).join(", ")}
Transcript start: "${transcriptSample}"

Return ONLY: { "suggestions": ["action1", "action2", "action3", "action4", "action5"] }
Rules: Imperative verb + specific detail. Based on this exact content. Max 8 words each.
Example: "Add captions to the opening hook at 0:10"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleaned = text.replace(/^```json\n?|\n?```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const aiSuggestions: string[] = parsed.suggestions ?? [];

    // Merge AI suggestions with instant ones, dedup
    const merged = [...new Set([...aiSuggestions, ...instant])].slice(0, 6);

    return NextResponse.json(
      { suggestions: merged },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    // Fallback gracefully — instant suggestions always work
    return NextResponse.json(
      { suggestions: instant },
      { headers: { "Cache-Control": "private, max-age=120" } },
    );
  }
}
