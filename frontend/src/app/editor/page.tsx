"use client";

import EditorLayout from "@/components/editor/EditorLayout";
import { useTranscription } from "@/hooks/useTranscription";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useShortcutsStore, matchEvent } from "@/stores/shortcutsStore";
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

  // Global keyboard shortcuts — driven by the user-customizable bindings store.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable)
        return;

      const b = useShortcutsStore.getState().bindings;
      const store = useEditorStore.getState();

      if (matchEvent(e, b.playPause)) {
        e.preventDefault();
        store.setIsPlaying(!store.isPlaying);
        return;
      }
      if (matchEvent(e, b.split)) {
        e.preventDefault();
        if (store.suggestions.length > 0) store.splitClipAtTime(store.currentTime);
        return;
      }
      if (matchEvent(e, b.addText)) {
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
        return;
      }
      // Delete: honor the bound key, plus Backspace as an always-on alias of the default.
      if (matchEvent(e, b.deleteClip) || (b.deleteClip === "Delete" && matchEvent(e, "Backspace"))) {
        if (store.selectedClipId) {
          e.preventDefault();
          store.deleteClip(store.selectedClipId);
        }
        return;
      }
      if (matchEvent(e, b.undo)) {
        e.preventDefault();
        store.undo();
        return;
      }
      if (matchEvent(e, b.redo)) {
        e.preventDefault();
        store.redo();
        return;
      }
      // Skip: match the key but ignore Shift so it can scale the nudge (1s → 5s).
      if (matchEvent(e, b.skipBack, { looseShift: true })) {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        store.setPendingSeek(Math.max(0, store.currentTime - delta));
        return;
      }
      if (matchEvent(e, b.skipForward, { looseShift: true })) {
        e.preventDefault();
        const delta = e.shiftKey ? 5 : 1;
        store.setPendingSeek(Math.min(store.duration, store.currentTime + delta));
        return;
      }
      if (matchEvent(e, b.preflight)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("qai:preflight"));
        return;
      }
      if (matchEvent(e, b.export)) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("qai:export"));
        return;
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
