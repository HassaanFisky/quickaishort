import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Guard: STT requires Google Cloud credentials
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return NextResponse.json(
      { error: "Speech-to-text not configured (missing GOOGLE_CLIENT_EMAIL / GOOGLE_PRIVATE_KEY)" },
      { status: 503 },
    );
  }

  try {
    // Lazy import — avoids build-time failure when credentials are absent
    const { SpeechClient } = await import("@google-cloud/speech");

    const speechClient = new SpeechClient({
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      projectId: process.env.GOOGLE_PROJECT_ID,
    });

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBytes = Buffer.from(arrayBuffer).toString("base64");

    const [response] = await speechClient.recognize({
      audio: { content: audioBytes },
      config: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        encoding: "WEBM_OPUS" as any,
        sampleRateHertz: 48000,
        languageCode: "en-US",
        enableWordTimeOffsets: false,
        enableAutomaticPunctuation: true,
        model: "latest_short",
      },
    });

    const transcript =
      response.results
        ?.map((r) => r.alternatives?.[0]?.transcript ?? "")
        .filter(Boolean)
        .join(" ")
        .trim() ?? "";

    return NextResponse.json({ transcript });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("STT error:", error);
    return NextResponse.json({ error: "Speech recognition failed", detail: msg }, { status: 500 });
  }
}
