// Module 5 (worker half) — Local WebAssembly Canvas Encoder
// Receives JPEG-compressed canvas frames from the main thread, writes them
// into FFmpeg.wasm's virtual filesystem as an image sequence, then executes
// a libx264 encode pass and transfers the resulting MP4 ArrayBuffer back.
//
// Installation (run from frontend/):
//   pnpm add @ffmpeg/ffmpeg@0.12.15 @ffmpeg/util@0.12.2
//
// SharedArrayBuffer is required — the editor route already sets COEP/COOP headers.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — install with: pnpm add @ffmpeg/ffmpeg@0.12.15 @ffmpeg/util@0.12.2
import { FFmpeg } from "@ffmpeg/ffmpeg";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { toBlobURL } from "@ffmpeg/util";

// CDN base for core WASM assets (loaded once, cached as Blob URLs)
const CDN = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

// Canvas dimensions — must match ENGINE_W × ENGINE_H in VideoEngineCore.ts
const CANVAS_W = 1080;
const CANVAS_H = 1920;

// Safety ceiling: 15 s × 30 fps = 450 JPEG frames (~30–60 MB at q=0.85)
const MAX_FRAMES = 450;

// ── State ─────────────────────────────────────────────────────────────────────
let ffmpeg: FFmpeg | null = null;
let isLoaded = false;
let isRecording = false;
let frameCount = 0;
let expectedFrames = MAX_FRAMES;

// ── Load FFmpeg.wasm ──────────────────────────────────────────────────────────
async function loadFFmpeg(): Promise<void> {
  ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }: { message: string }) => {
    self.postMessage({
      type: "log",
      stage: "encode",
      payload: { message },
      timestamp: Date.now(),
    });
  });

  ffmpeg.on("progress", ({ progress }: { progress: number }) => {
    // progress is 0.0 → 1.0 during the encode phase; shift it to 50–100 %
    // to visually indicate the two-phase pipeline (frame collection = 0–50 %)
    self.postMessage({
      type: "progress",
      stage: "encode",
      payload: { progress: 50 + Math.round(progress * 50) },
      timestamp: Date.now(),
    });
  });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CDN}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${CDN}/ffmpeg-core.wasm`, "application/wasm"),
  });

  isLoaded = true;
  self.postMessage({
    type: "status",
    stage: "ready",
    payload: { message: "FFmpeg.wasm ready" },
    timestamp: Date.now(),
  });
}

// ── Write one JPEG frame to the virtual filesystem ────────────────────────────
async function writeFrame(data: Uint8Array, index: number): Promise<void> {
  if (!ffmpeg || !isLoaded) return;
  // Zero-padded 6-digit filename for correct lexicographic sort
  const name = `frame_${index.toString().padStart(6, "0")}.jpg`;
  await ffmpeg.writeFile(name, data);
  frameCount++;

  // Progress: 0 → 50 % during frame collection phase
  self.postMessage({
    type: "progress",
    stage: "process",
    payload: {
      progress: Math.round((frameCount / expectedFrames) * 50),
      framesProcessed: frameCount,
      framesTotal: expectedFrames,
      message: `Buffering frame ${frameCount}/${expectedFrames}`,
    },
    timestamp: Date.now(),
  });
}

// ── Execute FFmpeg encode and transfer result ─────────────────────────────────
async function encode(fps: number): Promise<void> {
  if (!ffmpeg || !isLoaded || frameCount === 0) {
    self.postMessage({
      type: "error",
      stage: "encode",
      payload: { message: "No frames to encode" },
      timestamp: Date.now(),
    });
    return;
  }

  const outputName = "output.mp4";

  // Build rawvideo→H.264 pipeline matching the specified command:
  // -f rawvideo -pix_fmt rgba -s 1080x1920 -i pipe:0 ...
  // Using image sequence input (more memory-efficient than pipe in WASM)
  const execArgs: string[] = [
    "-framerate", fps.toString(),
    "-i", "frame_%06d.jpg",
    "-vf", `scale=${CANVAS_W}:${CANVAS_H}`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-y",
    outputName,
  ];

  await ffmpeg.exec(execArgs);

  // Read the encoded file out of the virtual FS.
  // readFile() returns Uint8Array when no encoding arg is passed.
  const raw = await ffmpeg.readFile(outputName) as Uint8Array | string;
  const outputBytes: Uint8Array =
    raw instanceof Uint8Array ? raw : new TextEncoder().encode(raw);

  // Clean up virtual FS to reclaim WASM memory
  await ffmpeg.deleteFile(outputName).catch(() => undefined);
  for (let i = 0; i < frameCount; i++) {
    const n = `frame_${i.toString().padStart(6, "0")}.jpg`;
    await ffmpeg.deleteFile(n).catch(() => undefined);
  }

  frameCount = 0;
  isRecording = false;

  // Transfer ownership of the buffer — zero-copy via structured-clone transfer list.
  // Cast through unknown to access the Worker-context postMessage overload that
  // accepts a Transferable[] without requiring the DedicatedWorkerGlobalScope type
  // (which is not included in Next.js's tsconfig lib array by default).
  const transferBuf = outputBytes.buffer as ArrayBuffer;
  (self.postMessage as (msg: unknown, opts: { transfer: Transferable[] }) => void)(
    {
      type: "complete",
      stage: "encode",
      payload: { artifact: transferBuf, message: "Encode complete" },
      timestamp: Date.now(),
    },
    { transfer: [transferBuf] },
  );
}

// ── Message handler ────────────────────────────────────────────────────────────
self.onmessage = async (e: MessageEvent<{
  type: string;
  payload: Record<string, unknown>;
}>) => {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case "load":
        if (isLoaded) {
          self.postMessage({
            type: "status",
            stage: "ready",
            payload: { message: "FFmpeg.wasm already loaded" },
            timestamp: Date.now(),
          });
        } else {
          await loadFFmpeg();
        }
        break;

      case "startRecording":
        if (!isLoaded) {
          self.postMessage({
            type: "error",
            stage: "process",
            payload: { message: "FFmpeg not loaded. Send 'load' first." },
            timestamp: Date.now(),
          });
          return;
        }
        frameCount = 0;
        expectedFrames = Math.min((payload.totalFrames as number) || MAX_FRAMES, MAX_FRAMES);
        isRecording = true;
        self.postMessage({
          type: "status",
          stage: "process",
          payload: { message: `Recording started — max ${expectedFrames} frames` },
          timestamp: Date.now(),
        });
        break;

      case "frame":
        if (!isRecording) return;
        if (frameCount >= MAX_FRAMES) {
          // Hard limit reached — auto-encode to avoid memory overflow
          self.postMessage({
            type: "warning",
            stage: "process",
            payload: { message: `Frame ceiling hit (${MAX_FRAMES}). Auto-encoding.` },
            timestamp: Date.now(),
          });
          await encode((payload.fps as number) || 30);
          return;
        }
        await writeFrame(payload.data as Uint8Array, frameCount);
        break;

      case "encode":
        await encode((payload.fps as number) || 30);
        break;

      case "cancel":
        isRecording = false;
        frameCount = 0;
        self.postMessage({
          type: "status",
          stage: "ready",
          payload: { message: "Export cancelled" },
          timestamp: Date.now(),
        });
        break;

      default:
        self.postMessage({
          type: "warning",
          stage: "process",
          payload: { message: `Unknown message type: "${type}"` },
          timestamp: Date.now(),
        });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown FFmpeg worker error";
    self.postMessage({
      type: "error",
      stage: "encode",
      payload: { message: msg },
      timestamp: Date.now(),
    });
  }
};
