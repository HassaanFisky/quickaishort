"use client";

import EditorLayout from "@/components/editor/EditorLayout";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useEffect, useRef, useState, useCallback } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useAIPanel } from "@/stores/aiPanelStore";
import { useShortcutsStore, matchEvent } from "@/stores/shortcutsStore";
import { TelemetryDock } from "@/components/editor/TelemetryDock";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { ShortcutOverlay } from "@/components/editor/ShortcutOverlay";

export default function EditorPage() {
  const analysis = useAnalysis();
  const [shortcutOverlayOpen, setShortcutOverlayOpen] = useState(false);
  const closeOverlay = useCallback(() => setShortcutOverlayOpen(false), []);

  const setSilenceSegments = useEditorStore((s) => s.setSilenceSegments);
  const sourceFile = useEditorStore((s) => s.sourceFile);
  const sourceUrl = useEditorStore((s) => s.sourceUrl);

  // Keep refs for values used inside the silence handler so the window listener
  // never re-registers on re-renders. Re-registration creates a window where
  // trigger-silence-detect events can be silently dropped.
  const sourceFileRef = useRef(sourceFile);
  const sourceUrlRef = useRef(sourceUrl);
  const analysisRef = useRef(analysis);
  useEffect(() => {
    sourceFileRef.current = sourceFile;
    sourceUrlRef.current = sourceUrl;
    analysisRef.current = analysis;
  });

  // Silence detection triggered by FloatingControls "Auto-Enhance" action.
  // Empty deps — stable registration for the lifetime of EditorPage.
  useEffect(() => {
    const handleSilenceTrigger = async () => {
      let source: File | string | null = sourceFileRef.current || sourceUrlRef.current;
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
        // Pass directly to the worker — do NOT store in Zustand.
        // The raw Float32Array is GC-eligible once detectSilence returns.
        analysisRef.current.detectSilence({ audioData, sampleRate });
      } catch (err) {
        console.error("Failed to extract audio for silence detection:", err);
      }
    };
    window.addEventListener("trigger-silence-detect", handleSilenceTrigger);
    return () =>
      window.removeEventListener("trigger-silence-detect", handleSilenceTrigger);
  }, []);

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
      // C — cut at playhead (razor tool alias, standard in Premiere/DaVinci)
      if (matchEvent(e, b.cutClip)) {
        e.preventDefault();
        if (store.suggestions.length > 0) store.splitClipAtTime(store.currentTime);
        return;
      }
      // ? — show/hide keyboard shortcut overlay
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShortcutOverlayOpen((v) => !v);
        return;
      }
      // Ctrl+K — open AI panel and switch to Tools tab
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        useEditorStore.getState().setAIPanelOpen(true);
        useAIPanel.getState().setOpen(true);
        useAIPanel.getState().setAiPanelMode("tools");
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

  // Init / teardown the analysis worker (used for silence detection here).
  // The transcription worker lifecycle is owned by useMediaPipeline.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { analysis.init(); return () => analysis.terminate(); }, []);

  return (
    <ErrorBoundary>
      <EditorLayout />
      <TelemetryDock />
      <ShortcutOverlay isOpen={shortcutOverlayOpen} onClose={closeOverlay} />
    </ErrorBoundary>
  );
}
