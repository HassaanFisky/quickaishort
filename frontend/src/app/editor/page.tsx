"use client";

import EditorLayout from "@/components/editor/EditorLayout";
import { useTranscription } from "@/hooks/useTranscription";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { TelemetryDock } from "@/components/editor/TelemetryDock";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { AIPanel } from "@/components/editor/AIPanel";

export default function EditorPage() {
  const transcription = useTranscription();
  const analysis = useAnalysis();

  const setSilenceSegments = useEditorStore(
    (state) => state.setSilenceSegments,
  );
  const setAudioData = useEditorStore((state) => state.setAudioData);
  const sourceFile = useEditorStore((state) => state.sourceFile);
  const sourceUrl = useEditorStore((state) => state.sourceUrl);

  useEffect(() => {
    const handleSilenceTrigger = async () => {
      let source: File | string | null = sourceFile || sourceUrl;
      if (!source) {
        console.warn("No source to analyze");
        return;
      }

      try {
        console.log("Starting silence detection...");
        
        // If it's a YouTube URL, use proxy to bypass CORS for audio extraction
        if (typeof source === "string" && (source.includes("youtube.com") || source.includes("youtu.be"))) {
          const { getProxyUrl } = await import("@/lib/api");
          source = getProxyUrl(source);
        }

        const { audioData, sampleRate } = await extractAudioData(source);
        setAudioData(audioData); // Store for visualization
        analysis.detectSilence({ audioData, sampleRate });
      } catch (err) {
        console.error("Failed to extract audio for silence detection:", err);
      }
    };

    window.addEventListener("trigger-silence-detect", handleSilenceTrigger);
    return () =>
      window.removeEventListener(
        "trigger-silence-detect",
        handleSilenceTrigger,
      );
  }, [sourceFile, sourceUrl, analysis, setAudioData]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in input/textarea/contenteditable
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable
      )
        return;

      const store = useEditorStore.getState();

      if (e.key === " ") {
        e.preventDefault();
        store.setIsPlaying(!store.isPlaying);
      }
      if (e.key === "s" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (store.suggestions.length > 0) {
          store.splitClipAtTime(store.currentTime);
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (store.selectedClipId) {
          e.preventDefault();
          store.deleteClip(store.selectedClipId);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        store.undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        store.redo();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        const newTime = Math.max(0, store.currentTime - delta);
        store.setPendingSeek(newTime);
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        const newTime = Math.min(store.duration, store.currentTime + delta);
        store.setPendingSeek(newTime);
      }
      if (e.key === "t" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        store.addCanvasElement({
          type: "text",
          content: "NEW TEXT",
          x: 200,
          y: 300,
          scale: 1.5,
          rotation: 0,
          style: { className: "text-3xl font-bold text-white" },
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (analysis.lastMessage?.type === "silence_detected") {
      const segments = analysis.lastMessage.payload.segments;
      if (segments) {
        setSilenceSegments(segments);
        console.log("Silence segments detected:", segments);
      }
    }
  }, [analysis.lastMessage, setSilenceSegments]);

  useEffect(() => {
    transcription.init();
    analysis.init();

    return () => {
      transcription.terminate();
      analysis.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { aiPanelOpen, setAIPanelOpen } = useEditorStore();

  return (
    <ErrorBoundary>
      <EditorLayout />
      <TelemetryDock />
      {/* AI Editor panel — fixed overlay, does not break existing layout */}
      <AIPanel />
      {/* Floating AI Edit toggle */}
      <button
        className="ai-panel-toggle"
        onClick={() => setAIPanelOpen(!aiPanelOpen)}
        aria-label="Toggle AI Editor"
      >
        <span className="ai-toggle-icon">✦</span>
        <span className="ai-toggle-label">AI Edit</span>
      </button>
    </ErrorBoundary>
  );
}
