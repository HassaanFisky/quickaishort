"use client";

import { useCallback, useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
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
    setAgentState,
  } = useEditorStore();

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
      setAgentState("ingestion", { status: "working", progress: 10 });
      setProgress(10);

      // 1. Extract Audio
      toast.info("Preparing content for viral analysis...");
      const { audioData, sampleRate, duration } =
        await extractAudioData(source);
      
      setAgentState("ingestion", { status: "done", progress: 100 });
      setProgress(20);

      // 2. Transcription
      setProcessing(true, "transcribing");
      setAgentState("transcription", { status: "working", progress: 0 });
      toast.info("Reading video content...");
      transcription.transcribe(audioData, sampleRate);
    } catch (error) {
      console.error("Pipeline error:", error);
      toast.error("Failed to process video");
      setAgentState("ingestion", { status: "error" });
      setProcessing(false, "idle");
    }
  }, [setProcessing, setProgress, setAgentState, transcription]);

  // Handle Transcription Complete
  useEffect(() => {
    if (
      transcription.lastMessage?.type === "complete" &&
      transcription.lastMessage.stage === "process"
    ) {
      const transcript = transcription.lastMessage.payload.transcript;
      if (!transcript) return; 
      
      setTranscript(transcript);
      setAgentState("transcription", { status: "done", progress: 100 });

      // 3. Analyze with Backend (Gemini)
      setProcessing(true, "analyzing");
      setAgentState("viralAnalysis", { status: "working", progress: 10 });
      toast.info("Finding the best clips...");

      const { sourceUrl } = useEditorStore.getState();
      
      analysis.analyzeWithBackend({
        videoId: sourceUrl || "local-video",
        transcript: transcript.chunks || transcript,
        duration: useEditorStore.getState().duration || 0,
      }).then((response: any) => {
        if (response.suggestedClips) {
          setAgentState("viralAnalysis", { status: "done", progress: 100 });
          setAgentState("reframing", { status: "working", progress: 50 });

          setSuggestions(
            response.suggestedClips.map((s: any) => ({
              ...s,
              aspectRatio: "9:16",
              captionsEnabled: true,
              status: "ready",
            })),
          );
          
          setAgentState("reframing", { status: "done", progress: 100 });
          setProcessing(false, "ready");
          setProgress(100);
          toast.success("AI Analysis complete! Suggestions ready.");
        }
      }).catch((err: any) => {
        console.error("Analysis error:", err);
        setAgentState("viralAnalysis", { status: "error" });
        setProcessing(false, "idle");
      });
    } else if (transcription.progress) {
      setAgentState("transcription", { progress: transcription.progress });
    }
  }, [
    transcription.lastMessage,
    transcription.progress,
    setTranscript,
    setProcessing,
    setAgentState,
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

      setAgentState("viralAnalysis", { status: "done", progress: 100 });
      setAgentState("reframing", { status: "working", progress: 80 });

      setSuggestions(
        suggestions.map((s: any) => ({
          ...s,
          aspectRatio: "9:16",
          captionsEnabled: true,
          status: "ready",
        })),
      );

      setAgentState("reframing", { status: "done", progress: 100 });
      setProcessing(false, "ready");
      setProgress(100);
      toast.success("Analysis complete! Suggestions ready.");
    } else if (analysis.progress) {
      setAgentState("viralAnalysis", { progress: analysis.progress });
    }
  }, [analysis.lastMessage, analysis.progress, setSuggestions, setProcessing, setAgentState, setProgress]);

  // Handle errors
  useEffect(() => {
    const error = transcription.error || analysis.error;
    if (error) {
      toast.error(error);
      if (transcription.error) setAgentState("transcription", { status: "error" });
      if (analysis.error) setAgentState("viralAnalysis", { status: "error" });
      setProcessing(false, "idle");
    }
  }, [transcription.error, analysis.error, setProcessing, setAgentState]);

  return {
    runPipeline,
    status: transcription.status || analysis.status,
    progress: transcription.progress || analysis.progress,
    stage: useEditorStore.getState().currentStage,
  };
}
