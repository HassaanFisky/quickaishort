"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useTranscription } from "./useTranscription";
import { useAnalysis } from "./useAnalysis";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { toast } from "sonner";
import { API_URL, getAudioUrl } from "@/lib/api";
import { useSession } from "next-auth/react";

export function useMediaPipeline() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "anonymous";

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

  const abortControllerRef = useRef<AbortController | null>(null);

  /** Cancels the running pipeline immediately. */
  const cancelPipeline = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const runPipeline = useCallback(async () => {
    const { sourceFile, sourceUrl } = useEditorStore.getState();
    let source: File | string | null = sourceFile || sourceUrl;

    if (!source) {
      toast.error("No video source found");
      return;
    }

    // Route YouTube URLs through the backend proxy to avoid CORS.
    // Guard against double-wrapping: skip if sourceUrl was already set to the
    // proxy endpoint by EditorLayout.handleAnalyze.
    if (typeof source === "string") {
      const isAlreadyProxied = API_URL && source.startsWith(API_URL);
      const isYouTube =
        source.includes("youtube.com") || source.includes("youtu.be");

      if (!isAlreadyProxied && !isYouTube) {
        toast.error("Only YouTube URLs are supported. Google Drive and other links are not yet supported.");
        return;
      }

      if (isYouTube && !isAlreadyProxied) {
        source = getAudioUrl(source);
      }
    }

    // Extended to 120 seconds to handle long-form content (podcasts, lectures)
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      setProcessing(true, "loading");
      setAgentState("ingestion", { status: "working", progress: 10 });
      setProgress(10);

      // 1. Extract Audio
      toast.info("Preparing content for viral analysis...");
      const { audioData, sampleRate, duration } =
        await extractAudioData(source, controller.signal);
      clearTimeout(timeoutId);

      // Update duration in store if it was 0
      if (useEditorStore.getState().duration === 0) {
        useEditorStore.setState({ duration });
      }

      setAgentState("ingestion", { status: "done", progress: 100 });
      setProgress(20);

      // 2. Transcription
      setProcessing(true, "transcribing");
      setAgentState("transcription", { status: "working", progress: 0 });
      toast.info("Reading video content...");
      transcription.transcribe(audioData, sampleRate);
    } catch (error) {
      clearTimeout(timeoutId);
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Pipeline error:", msg);
      
      let displayMsg = "Could not process this video — please try a different YouTube URL";
      const lowerMsg = msg.toLowerCase();
      
      if (error instanceof Error && error.name === "AbortError") {
        displayMsg = "Audio processing timed out — video may be too long";
      } else if (lowerMsg.includes("504") || lowerMsg.includes("timed out") || lowerMsg.includes("timeout")) {
        displayMsg = "Video processing timed out — try a shorter clip or try again";
      } else if (lowerMsg.includes("503") || lowerMsg.includes("unavailable")) {
        displayMsg = "YouTube is blocking video access from our servers. The AI analysis couldn't complete — try adding YouTube cookies in Settings.";
      } else if (lowerMsg.includes("unavailable") || lowerMsg.includes("private")) {
        displayMsg = "This video is unavailable or private — try a public YouTube video";
      } else if (lowerMsg.includes("yt-dlp")) {
        displayMsg = "YouTube is blocking this video. Try adding YouTube cookies in Settings, or try a different video.";
      }
      
      toast.error(displayMsg);
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
        user_id: userId,
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
      }).catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { detail?: string; message?: string } } })?.response?.data?.detail ||
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          (err instanceof Error ? err.message : "Analysis failed");
        toast.error(typeof msg === "string" ? msg : "Analysis failed. Please try again.");
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
    cancelPipeline,
    status: transcription.status || analysis.status,
    progress: transcription.progress || analysis.progress,
    stage: useEditorStore.getState().currentStage,
  };
}
