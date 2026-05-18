import { NextRequest, NextResponse } from "next/server";
import { analyzeVideoWithGemini } from "@/lib/gemini-editor";

export async function POST(req: NextRequest) {
  const { gcsUri, videoUrl, videoTitle } = await req.json();

  // Path A: GCS URI provided → Google Video Intelligence (deep analysis)
  if (gcsUri) {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "Video Intelligence not configured (missing Google Cloud credentials)" },
        { status: 503 },
      );
    }

    try {
      const { VideoIntelligenceServiceClient, protos } = await import(
        "@google-cloud/video-intelligence"
      );

      const videoClient = new VideoIntelligenceServiceClient({
        credentials: {
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        },
      });

      const [operation] = await videoClient.annotateVideo({
        inputUri: gcsUri,
        features: [
          protos.google.cloud.videointelligence.v1.Feature.SHOT_CHANGE_DETECTION,
          protos.google.cloud.videointelligence.v1.Feature.SPEECH_TRANSCRIPTION,
          protos.google.cloud.videointelligence.v1.Feature.LABEL_DETECTION,
        ],
        videoContext: {
          speechTranscriptionConfig: {
            languageCode: "en-US",
            enableAutomaticPunctuation: true,
          },
        },
      });

      const [result] = await operation.promise();
      const ann = result.annotationResults?.[0];

      const scenes =
        ann?.shotAnnotations?.map((shot) => ({
          time: Number(shot.startTimeOffset?.seconds ?? 0),
          description: "Scene change",
        })) ?? [];

      const transcript =
        ann?.speechTranscriptions?.flatMap((t) => {
          const words = t.alternatives?.[0]?.words ?? [];
          const segments: { text: string; startTime: number; endTime: number }[] = [];
          for (let i = 0; i < words.length; i += 8) {
            const chunk = words.slice(i, i + 8);
            segments.push({
              text: chunk.map((w) => w.word).join(" "),
              startTime: Number(chunk[0]?.startTime?.seconds ?? 0),
              endTime: Number(chunk[chunk.length - 1]?.endTime?.seconds ?? 0),
            });
          }
          return segments;
        }) ?? [];

      const topics =
        ann?.segmentLabelAnnotations
          ?.map((l) => l.entity?.description ?? "")
          .filter(Boolean)
          .slice(0, 10) ?? [];

      return NextResponse.json({ scenes, transcript, topics, suggestedEdits: [] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Path B: No GCS URI — lightweight Gemini metadata analysis
  if (videoUrl && videoTitle) {
    try {
      const result = await analyzeVideoWithGemini(videoUrl, videoTitle);
      return NextResponse.json({
        scenes: [],
        transcript: [],
        topics: result.topics,
        suggestedEdits: result.suggestedEdits,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Provide gcsUri or videoUrl+videoTitle" }, { status: 400 });
}
