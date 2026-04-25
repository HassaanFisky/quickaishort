"use client";

import { useState, useCallback, useRef } from "react";

import { WorkerMessage, WorkerStatus } from "@/types/pipeline";

export { type WorkerMessage, type WorkerStatus };

export function useWorker(workerFactory: () => Worker) {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<WorkerStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [lastMessage, setLastMessage] = useState<WorkerMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    try {
      setStatus("loading");
      const w = workerFactory();

      w.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        setLastMessage(msg);

        if (msg.type === "progress" && msg.payload.progress !== undefined) {
          setProgress(msg.payload.progress);
        }

        if (msg.type === "status" && msg.stage === "load") {
          setStatus("ready");
        }

        if (msg.type === "error") {
          setStatus("error");
          setError(msg.payload.message || "Unknown worker error");
        }
      };

      w.onerror = (e) => {
        console.error("Worker error:", e);
        setStatus("error");
        setError("Worker crashed or failed to load");
      };

      workerRef.current = w;
      return w;
    } catch (err) {
      console.error("Failed to initialize worker:", err);
      setStatus("error");
      setError("Failed to initialize worker");
      return null;
    }
  }, [workerFactory]);

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
      setStatus("idle");
    }
  }, []);

  const postMessage = useCallback(
    (type: string, payload: unknown) => {
      const w = workerRef.current;
      if (!w) {
        console.error("Worker not initialized — call initWorker() first");
        return;
      }
      w.postMessage({ type, payload });
    },
    [],
  );

  return {
    worker: workerRef.current,
    status,
    progress,
    lastMessage,
    error,
    initWorker,
    terminateWorker,
    postMessage,
  };
}
