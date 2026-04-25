"use client";

import { useCallback, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useMediaEngine } from "./useMediaEngine";
import { useTranscription } from "./useTranscription";
import { useAnalysis } from "./useAnalysis";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { toast } from "sonner";

export function useMediaPipeline() {
  const {
    sourceFile,
    setProcessing,
    setProgress,
    setTranscript,
    setSuggestions,
  } = useEditorStore();

  const mediaEngine = useMediaEngine();
  const transcription = useTranscription();
  const analysis = useAnalysis();

  const runPipeline = useCallback(async () => {
    const { sourceFile, sourceUrl } = useEditorStore.getState();
    const source = sourceFile || sourceUrl;

    if (!source) {
      toast.error("No video source found");
      return;
    }

    try {
      setProcessing(true, "loading");
      setProgress(10);

      // 1. Extract Audio
      toast.info("Extracting audio for analysis...");
      const { audioData, sampleRate, duration } =
        await extractAudioData(source);
      setProgress(20);

      // 2. Transcription
      setProcessing(true, "transcribing");
      toast.info("Transcribing video...");
      transcription.transcribe(audioData, sampleRate);
    } catch (error) {
      console.error("Pipeline error:", error);
      toast.error("Failed to process video");
      setProcessing(false, "idle");
    }
  }, [setProcessing, setProgress, transcription]);

  // Handle Transcription Complete
  useEffect(() => {
    if (
      transcription.lastMessage?.type === "complete" &&
      transcription.lastMessage.stage === "process"
    ) {
      const transcript = transcription.lastMessage.payload.transcript;
      if (!transcript) return; // Guard against undefined transcript
      setTranscript(transcript);

      // 3. Analyze with Backend (Gemini)
      setProcessing(true, "analyzing");
      toast.info("AI Analysis in progress...");

      const { sourceUrl } = useEditorStore.getState();
      
      analysis.analyzeWithBackend({
        videoId: sourceUrl || "local-video",
        transcript: transcript.chunks || transcript,
        duration: useEditorStore.getState().duration || 0,
      }).then((response: any) => {
        if (response.suggestedClips) {
          setSuggestions(
            response.suggestedClips.map((s: any) => ({
              ...s,
              aspectRatio: "9:16",
              captionsEnabled: true,
              status: "ready",
            })),
          );
          setProcessing(false, "ready");
          setProgress(100);
          toast.success("AI Analysis complete! Suggestions ready.");
        }
      }).catch((err: any) => {
        console.error("Analysis error:", err);
        setProcessing(false, "idle");
      });
    }
  }, [
    transcription.lastMessage,
    setTranscript,
    setProcessing,
    setSuggestions,
    setProgress,
    analysis,
  ]);

  // Handle Analysis Complete
  useEffect(() => {
    if (
      analysis.lastMessage?.type === "complete" &&
      analysis.lastMessage.stage === "process"
    ) {
      const suggestions = analysis.lastMessage.payload.suggestions;
      if (!suggestions) return;

      setSuggestions(
        suggestions.map((s: any) => ({
          ...s,
          aspectRatio: "9:16",
          captionsEnabled: true,
          status: "ready",
        })),
      );

      setProcessing(false, "ready");
      setProgress(100);
      toast.success("Analysis complete! Suggestions ready.");
    }
  }, [analysis.lastMessage, setSuggestions, setProcessing, setProgress]);

  // Handle errors
  useEffect(() => {
    const error = transcription.error || analysis.error || mediaEngine.error;
    if (error) {
      toast.error(error);
      setProcessing(false, "idle");
    }
  }, [transcription.error, analysis.error, mediaEngine.error, setProcessing]);

  return {
    runPipeline,
    status: transcription.status || analysis.status || mediaEngine.status,
    progress:
      transcription.progress || analysis.progress || mediaEngine.progress,
    stage: useEditorStore.getState().currentStage,
  };
}
