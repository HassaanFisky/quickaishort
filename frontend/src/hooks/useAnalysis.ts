"use client";

import { useCallback, useState } from "react";
import { useWorker } from "./useWorker";
import axios from "axios";
import { TranscriptChunk, Clip } from "@/types/pipeline";
import { API_URL } from "@/lib/api";



export function useAnalysis() {
  const [isBackendAnalyzing, setIsBackendAnalyzing] = useState(false);
  const [backendError, setBackendError] = useState<string | null>(null);

  const workerFactory = useCallback(() => {
    return new Worker(
      new URL("../workers/analysis.worker.ts", import.meta.url),
    );
  }, []);

  const {
    status,
    progress,
    lastMessage,
    error: workerError,
    initWorker,
    postMessage,
    terminateWorker,
  } = useWorker(workerFactory);

  const analyze = useCallback(
    (payload: {
      audioData: Float32Array;
      transcript: { chunks: TranscriptChunk[] };
      duration: number;
      sampleRate: number;
    }) => {
      postMessage("analyze", payload);
    },
    [postMessage],
  );

  const analyzeWithBackend = useCallback(
    async (payload: {
      videoId: string;
      transcript: TranscriptChunk[];
      duration: number;
    }) => {
      setIsBackendAnalyzing(true);
      setBackendError(null);
      try {
        const response = await axios.post(`${API_URL}/api/analyze`, payload);
        setIsBackendAnalyzing(false);
        return response.data;
      } catch (err: any) {
        const msg = err.response?.data?.detail || err.message || "Backend analysis failed";
        setBackendError(msg);
        setIsBackendAnalyzing(false);
        throw new Error(msg);
      }
    },
    [],
  );

  return {
    isReady: status === "ready" || status === "idle",
    isAnalyzing: status === "running" || isBackendAnalyzing,
    progress,
    lastMessage,
    error: workerError || backendError,
    analyze,
    analyzeWithBackend,
    detectSilence: (payload: {
      audioData: Float32Array;
      sampleRate: number;
    }) => {
      postMessage("detect_silence", payload);
    },
    status,
    init: initWorker,
    terminate: terminateWorker,
  };
}
