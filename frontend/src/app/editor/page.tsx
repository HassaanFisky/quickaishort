"use client";

import EditorLayout from "@/components/editor/EditorLayout";
import { useTranscription } from "@/hooks/useTranscription";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { TelemetryDock } from "@/components/editor/TelemetryDock";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { extractAudioData } from "@/lib/utils/audioExtractor";

export default function EditorPage() {
  const transcription = useTranscription();
  const analysis = useAnalysis();

  const setSilenceSegments = useEditorStore((s) => s.setSilenceSegments);
  const setAudioData = useEditorStore((s) => s.setAudioData);
  const sourceFile = useEditorStore((s) => s.sourceFile);
  const sourceUrl = useEditorStore((s) => s.sourceUrl);

  // Silence detection triggered by FloatingControls "Auto-Enhance" action
  useEffect(() => {
    const handleSilenceTrigger = async () => {
      let source: File | string | null = sourceFile || sourceUrl;
      if (!source) return;
      try {
        if (
          typeof source === "string" &&
          (/\/\/(?:[a-z]+\.)?youtube\.com\/|:\/\/youtu\.be\//.test(source))
        ) {
          const { getProxyUrl } = await import("@/lib/api");
          source = getProxyUrl(source);
        }
        const { audioData, sampleRate } = await extractAudioData(source);
        setAudioData(audioData);
        analysis.detectSilence({ audioData, sampleRate });
      } catch (err) {
        console.error("Failed to extract audio for silence detection:", err);
      }
    };
    window.addEventListener("trigger-silence-detect", handleSilenceTrigger);
    return () =>
      window.removeEventListener("trigger-silence-detect", handleSilenceTrigger);
  }, [sourceFile, sourceUrl, analysis, setAudioData]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;

      const store = useEditorStore.getState();

      if (e.key === " ") {
        e.preventDefault();
        store.setIsPlaying(!store.isPlaying);
      }
      if (e.key === "s" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (store.suggestions.length > 0) store.splitClipAtTime(store.currentTime);
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
        store.setPendingSeek(Math.max(0, store.currentTime - delta));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        store.setPendingSeek(Math.min(store.duration, store.currentTime + delta));
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

  // Push detected silence segments into store
  useEffect(() => {
    if (analysis.lastMessage?.type === "silence_detected") {
      const segments = analysis.lastMessage.payload.segments;
      if (segments) setSilenceSegments(segments);
    }
  }, [analysis.lastMessage, setSilenceSegments]);

  // Init / teardown Web Workers
  useEffect(() => {
    transcription.init();
    analysis.init();
    return () => {
      transcription.terminate();
      analysis.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ErrorBoundary>
      <EditorLayout />
      <TelemetryDock />
    </ErrorBoundary>
  );
}
