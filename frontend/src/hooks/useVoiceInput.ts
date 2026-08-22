import { useState, useRef, useCallback, useEffect } from "react";

type TranscriptCallback = (text: string, isFinal: boolean) => void;

type SpeechWindow = {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as SpeechWindow;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * Chat dictation — browser speech only. Paid cloud STT is retired (410).
 * Video captions use on-device transcription (`useTranscription`), not this hook.
 */
export function useVoiceInput(onTranscript: TranscriptCallback) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);

    const SpeechAPI = getSpeechRecognitionCtor();
    if (!SpeechAPI) {
      setError(
        "Browser voice is not supported here. Type your command instead.",
      );
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
          ? "Mic permission denied"
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
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return { isRecording, startRecording, stopRecording, error };
}
