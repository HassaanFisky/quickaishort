"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isBrowserSpeechPreviewAvailable,
  speakLines,
  type SpeechLine,
  type SpeakHandle,
} from "@/lib/studio/browserSpeechPreview";
import { SPEECH_COPY } from "@/lib/studio/computePlane";

export type BrowserSpeechPreviewStatus =
  | "idle"
  | "playing"
  | "unsupported"
  | "error";

export function useBrowserSpeechPreview() {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<BrowserSpeechPreviewStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<SpeakHandle | null>(null);

  useEffect(() => {
    setAvailable(isBrowserSpeechPreviewAvailable());
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    handleRef.current?.stop();
    handleRef.current = null;
    setStatus("idle");
  }, []);

  const play = useCallback(
    async (lines: SpeechLine[], lang: string | null) => {
      if (!isBrowserSpeechPreviewAvailable()) {
        setStatus("unsupported");
        setError(SPEECH_COPY.dubPreviewUnsupported);
        return;
      }
      handleRef.current?.stop();
      setError(null);
      const handle = await speakLines(lines, lang ?? "en", {
        onStart: () => setStatus("playing"),
        onEnd: () => {
          handleRef.current = null;
          setStatus("idle");
        },
        onError: (message) => {
          handleRef.current = null;
          setStatus("error");
          setError(message);
        },
      });
      handleRef.current = handle;
    },
    [],
  );

  return { available, status, error, play, stop };
}
