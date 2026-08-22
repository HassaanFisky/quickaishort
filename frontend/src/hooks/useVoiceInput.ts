import { useState, useRef, useCallback, useEffect } from "react";
import { SPEECH_COPY } from "@/lib/studio/computePlane";

type TranscriptCallback = (text: string, isFinal: boolean) => void;

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

export function isBrowserVoiceAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as SpeechWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Chat mic: browser Speech Recognition only.
 * Paid Next.js STT is retired (410). Do not POST audio to /api/speech-to-text.
 */
export function useVoiceInput(onTranscript: TranscriptCallback) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    setAvailable(isBrowserVoiceAvailable());
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);

    const w = window as SpeechWindow;
    const SpeechAPI = w.SpeechRecognition || w.webkitSpeechRecognition;

    if (!SpeechAPI) {
      setError(SPEECH_COPY.chatVoiceUnsupported);
      setIsRecording(false);
      return;
    }

    const recognition = new SpeechAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) onTranscript(finalText, true);
      else if (interimText) onTranscript(interimText, false);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setError(
        e.error === "not-allowed"
          ? SPEECH_COPY.chatVoiceDenied
          : `Browser voice error: ${e.error}`,
      );
      setIsRecording(false);
    };

    recognition.onend = () => {
      if (recognitionRef.current) recognition.start();
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      r.onend = null;
      r.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return { isRecording, startRecording, stopRecording, error, available };
}
