/**
 * RETIRED — voice input uses the browser Web Speech API (useVoiceInput), not Cloud STT.
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "retired",
      detail: "POST /api/speech-to-text is retired. Use browser speech recognition.",
    },
    { status: 410 },
  );
}
