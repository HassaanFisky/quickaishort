import { NextResponse } from "next/server";
import { z } from "zod";

// --- Types & Validation --- //

const CreateShortRequestSchema = z.object({
  youtubeUrl: z.string().url(),
  startTime: z.number().min(0).optional(), // Optional manual crop
  duration: z.number().min(5).max(60).default(30),
  theme: z.enum(["dark", "light", "neon"]).default("dark"),
  autoCaptions: z.boolean().default(true),
});

// Mock Database / Queue placeholders
// In production, use Redis/BullMQ or Google Cloud Tasks
const JOB_QUEUE: Record<
  string,
  { status: string; progress: number; result?: string }
> = {};

// --- Helper: Simulate Analysis --- //
// This would utilize Google Gemini 1.5 Pro to find the "viral" segment
async function analyzeVideoContent(url: string) {
  // Simulate API latency
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return {
    bestSegmentStart: 45, // AI detected "viral" start
    viralityScore: 9.8,
  };
}

// --- Helper: Simulate FFmpeg Job --- //
// This would run the actual ffmpeg command on a worker (Cloud Run Job)
async function triggerTranscodeJob(
  jobId: string,
  params: z.infer<typeof CreateShortRequestSchema> & { startTime: number },
) {
  // In reality: await fetch('https://worker-service/jobs', { ... })
  console.log(`[Worker] Starting job ${jobId} with params:`, params);

  // Simulate async processing
  setTimeout(() => {
    JOB_QUEUE[jobId] = { status: "processing", progress: 50 };
  }, 2000);

  setTimeout(() => {
    JOB_QUEUE[jobId] = {
      status: "completed",
      progress: 100,
      result: "https://storage.googleapis.com/quickai-shorts/preview-123.mp4",
    };
  }, 5000);
}

// --- API Handler --- //

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = CreateShortRequestSchema.parse(body);

    // 1. Generate unique Job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 2. Run Analysis (if no explicit start time)
    let segmentStart = validated.startTime;
    if (segmentStart === undefined) {
      const analysis = await analyzeVideoContent(validated.youtubeUrl);
      segmentStart = analysis.bestSegmentStart;
    }

    // 3. Initialize Job Status
    JOB_QUEUE[jobId] = { status: "queued", progress: 0 };

    // 4. Trigger Async Worker (Fire & Forget in this MVP scope)
    triggerTranscodeJob(jobId, { ...validated, startTime: segmentStart });

    // 5. Return Job ID to client
    return NextResponse.json({
      success: true,
      jobId,
      message:
        "Job queued successfully. Poll /api/shorts/status/:jobId for updates.",
      estimatedTime: 15, // seconds
    });
  } catch (error) {
    console.error("Create Short Error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.issues },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
