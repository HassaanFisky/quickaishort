import { pipeline } from "@xenova/transformers";

// Use any for pipeline as the types are complex and not fully exported
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;

async function loadWhisper(model: string = "Xenova/whisper-tiny.en") {
  if (transcriber) return transcriber;

  self.postMessage({
    type: "status",
    stage: "download",
    payload: { message: `Loading ${model}...` },
  });

  transcriber = await pipeline("automatic-speech-recognition", model, {
    progress_callback: (progress: {
      status: string;
      progress: number;
      loaded: number;
      total: number;
    }) => {
      if (progress.status === "progress") {
        self.postMessage({
          type: "progress",
          stage: "download",
          payload: {
            progress: Math.round(progress.progress),
            bytesLoaded: progress.loaded,
            bytesTotal: progress.total,
          },
        });
      }
    },
  });

  return transcriber;
}

async function transcribe(audioData: Float32Array) {
  const whisper = await loadWhisper();

  self.postMessage({
    type: "status",
    stage: "process",
    payload: { message: "Transcribing..." },
  });

  const result = await whisper(audioData, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    task: "transcribe",
  });

  return result;
}

self.onmessage = async (e: MessageEvent) => {
  try {
    const { type, payload } = e.data;

    switch (type) {
      case "load":
        await loadWhisper(payload?.model);
        self.postMessage({
          type: "complete",
          stage: "load",
          payload: { message: "Whisper loaded" },
        });
        break;

      case "transcribe":
        const result = await transcribe(payload.audioData);
        self.postMessage({
          type: "complete",
          stage: "process",
          payload: { transcript: result },
        });
        break;
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      stage: "process",
      payload: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
