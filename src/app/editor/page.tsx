"use client";

import EditorLayout from "@/components/editor/EditorLayout";
import { useTranscription } from "@/hooks/useTranscription";
import { useAnalysis } from "@/hooks/useAnalysis";
import { useEffect } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { TelemetryDock } from "@/components/editor/TelemetryDock";

import { extractAudioData } from "@/lib/utils/audioExtractor";

export default function EditorPage() {
  const transcription = useTranscription();
  const analysis = useAnalysis();

  const setSilenceSegments = useEditorStore(
    (state) => state.setSilenceSegments,
  );
  const setAudioData = useEditorStore((state) => state.setAudioData);
  const sourceFile = useEditorStore((state) => state.sourceFile);

  useEffect(() => {
    const handleSilenceTrigger = async () => {
      if (!sourceFile) {
        console.warn("No source file to analyze");
        return;
      }

      try {
        console.log("Starting silence detection...");
        // TODO: Set analyzing state in store
        const { audioData, sampleRate } = await extractAudioData(sourceFile);
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
  }, [sourceFile, analysis, setAudioData]);

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

  return (
    <>
      <EditorLayout />
      <TelemetryDock />
    </>
  );
}
