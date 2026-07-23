/**
 * RETIRED — browser/editor analysis uses FastAPI + Whisper; paid Video Intelligence
 * and client-side Gemini routes are removed to avoid undeclared Google SDK deps.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "retired",
      detail: "POST /api/analyze-video is retired. Use the FastAPI AI editor pipeline.",
      replacement: "/api/ai-editor/command",
    },
    { status: 410 },
  );
}
