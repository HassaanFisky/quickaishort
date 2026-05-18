import { useState, useRef, useCallback, useEffect } from "react";

type TranscriptCallback = (text: string, isFinal: boolean) => void;

export function useVoiceInput(onTranscript: TranscriptCallback) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);

    // Priority 1: Web Speech API (free, Chrome/Edge)
    const SpeechAPI =
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .SpeechRecognition ||
      (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown })
        .webkitSpeechRecognition;

    if (SpeechAPI) {
      const recognition = new (SpeechAPI as new () => SpeechRecognition)();
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
        setError(e.error === "not-allowed" ? "Mic permission denied" : `Error: ${e.error}`);
        setIsRecording(false);
      };

      recognition.onend = () => {
        // Auto-restart if still recording (handles browser auto-stop)
        if (recognitionRef.current) recognition.start();
      };

      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
      return;
    }

    // Fallback: MediaRecorder → GCloud STT backend
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "voice.webm");

        try {
          const res = await fetch("/api/speech-to-text", { method: "POST", body: fd });
          const data = await res.json();
          if (data.transcript) onTranscript(data.transcript, true);
          else if (data.error) setError(data.error);
        } catch {
          setError("Transcription failed");
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }, [onTranscript]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      const r = recognitionRef.current as SpeechRecognition;
      r.onend = null;
      r.stop();
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  useEffect(() => () => stopRecording(), [stopRecording]);

  return { isRecording, startRecording, stopRecording, error };
}
