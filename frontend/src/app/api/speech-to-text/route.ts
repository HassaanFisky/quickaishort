/**
 * RETIRED — paid cloud STT is gated off. Voice input uses browser voice
 * (useVoiceInput). Video captions use on-device transcription (whisper.worker).
 */
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "retired",
      detail:
        "Cloud speech-to-text is retired. Use on-device transcription or browser voice.",
    },
    { status: 410 },
  );
}
