"use client";

import { useCallback } from "react";
import { useWorker } from "./useWorker";

export function useTranscription() {
  const workerFactory = useCallback(() => {
    return new Worker(new URL("../workers/whisper.worker.ts", import.meta.url));
  }, []);

  const {
    status,
    progress,
    lastMessage,
    error,
    initWorker,
    postMessage,
    terminateWorker,
  } = useWorker(workerFactory);

  const transcribe = useCallback(
    (audioData: Float32Array, sampleRate: number) => {
      postMessage("transcribe", { audioData, sampleRate });
    },
    [postMessage]
  );

  const loadModel = useCallback(
    (model?: string) => {
      postMessage("load", { model });
    },
    [postMessage]
  );

  return {
    isReady: status === "ready" || status === "idle", // Whisper can be idle then load
    isLoading: status === "loading",
    isTranscribing: status === "running",
    progress,
    lastMessage,
    error,
    transcribe,
    loadModel,
    status,
    init: initWorker,
    terminate: terminateWorker,
  };
}
