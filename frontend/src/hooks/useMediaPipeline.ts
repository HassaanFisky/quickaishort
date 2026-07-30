"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useTranscription } from "./useTranscription";
import { useAnalysis } from "./useAnalysis";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { toast } from "sonner";
import { API_URL, getAudioUrl } from "@/lib/api";
import { useSession } from "next-auth/react";
import type { Clip, Transcript } from "@/types/pipeline";
import { saveIngestArtifact } from "@/lib/studio/ingestArtifacts";
import { isDirectVideoUrl, type IngestStage } from "@/lib/studio/ingestFsm";
import { saveIngestSession } from "@/lib/studio/ingestSession";
import { parseYouTubeId } from "@/lib/youtube-utils";

/**
 * Reduce a Float32Array to 120 amplitude peaks for waveform display.
 * Strides through each bar window (max 50 samples) so complexity is O(1)
 * in audio length regardless of video duration. Safe to call on the main
 * thread for any video length without causing a noticeable UI freeze.
 */
function computeWaveformPeaks(audioData: Float32Array, barCount = 120): number[] {
  const step = Math.floor(audioData.length / barCount);
  return Array.from({ length: barCount }, (_, i) => {
    const start = i * step;
    const end = Math.min(start + step, audioData.length);
    const stride = Math.max(1, Math.floor((end - start) / 50));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += stride) {
      sum += Math.abs(audioData[j]);
      count++;
    }
    return count > 0 ? Math.max(0.01, Math.min(1, (sum / count) * 10)) : 0.01;
  });
}

/** Walk legal forward edges to terminal ready (never skips the FSM table). */
function advanceIngestToReady(): void {
  const store = useEditorStore.getState();
  const path: IngestStage[] = [
    "identify",
    "validate",
    "acquire_meta",
    "projectize",
    "analyze",
    "ready",
  ];
  let cur = store.ingestStage;
  if (cur === "ready" || cur === "failed" || cur === "idle") return;
  const idx = path.indexOf(cur);
  if (idx < 0) return;
  for (let i = idx + 1; i < path.length; i++) {
    store.setIngestStage(path[i]!);
    cur = path[i]!;
  }
}

async function persistArtifactsAndReady(opts: {
  suggestions: Clip[];
}): Promise<void> {
  const store = useEditorStore.getState();
  const fingerprint = store.ingestFingerprint;
  const transcript = store.transcript;
  if (fingerprint && transcript?.chunks?.length) {
    await saveIngestArtifact({
      fingerprint,
      duration: store.duration,
      transcript,
      suggestions: opts.suggestions,
      silenceSegments: store.silenceSegments,
      waveformPeaks: store.waveformPeaks,
      title: store.videoMetadata?.title,
    });
    // Refresh-safe URL session (files cannot survive reload — no extra cloud writes).
    const url = store.sourceUrl;
    if (url && (parseYouTubeId(url) || isDirectVideoUrl(url))) {
      saveIngestSession({
        v: 1,
        url,
        fingerprint,
        kind: parseYouTubeId(url) ? "youtube" : "direct_url",
        title: store.videoMetadata?.title,
      });
    }
  }
  // MediaGraph upsert stays in AIPanel — avoid duplicate Firestore writes here.
  advanceIngestToReady();
}

export function useMediaPipeline() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "anonymous";

  const {
    setProcessing,
    setProgress,
    setTranscript,
    setSuggestions,
    setAgentState,
    setWaveformPeaks,
  } = useEditorStore();

  const transcription = useTranscription();
  const analysis = useAnalysis();

  const abortControllerRef = useRef<AbortController | null>(null);

  const transcriptionRef = useRef(transcription);
  useEffect(() => {
    transcriptionRef.current = transcription;
  });

  const activeRunIdRef = useRef<string | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => transcriptionRef.current.terminate(), []);

  const cancelPipeline = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRunIdRef.current = null;
    transcriptionRef.current.terminate();
  }, []);

  const runPipeline = useCallback(async () => {
    if (useEditorStore.getState().isProcessing) return;

    const { sourceFile, sourceUrl, ingestFromCache, ingestStage } =
      useEditorStore.getState();
    if (ingestFromCache && ingestStage === "ready") return;

    let source: File | string | null = sourceFile || sourceUrl;

    if (!source) {
      toast.error("No video source found");
      useEditorStore.getState().failIngest("unknown", "No video source found");
      return;
    }

    const stageNow = useEditorStore.getState().ingestStage;
    if (stageNow === "projectize") {
      useEditorStore.getState().setIngestStage("analyze");
    } else if (
      stageNow !== "analyze" &&
      stageNow !== "ready" &&
      stageNow !== "failed"
    ) {
      useEditorStore.getState().setIngestStage("analyze");
    }

    if (typeof source === "string") {
      const isAlreadyProxied = Boolean(API_URL && source.startsWith(API_URL));
      const isYouTube =
        source.includes("youtube.com") || source.includes("youtu.be");
      const isDirect = /\.(mp4|webm|mov)([\?#].*)?$/i.test(source);

      if (!isAlreadyProxied && !isYouTube && !isDirect) {
        toast.error(
          "Only YouTube URLs are supported. Google Drive and other links are not yet supported.",
        );
        useEditorStore
          .getState()
          .failIngest("unsupported_provider", "Unsupported media URL for analysis.");
        return;
      }

      if (isYouTube && !isAlreadyProxied) {
        source = getAudioUrl(source);
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    setProcessing(true, "loading");
    setAgentState("ingestion", { status: "working", progress: 10 });
    setProgress(10);
    toast.info("Preparing content for analysis…");

    void extractAudioData(source, controller.signal)
      .then(({ audioData, sampleRate, duration }) => {
        clearTimeout(timeoutId);
        setWaveformPeaks(computeWaveformPeaks(audioData));

        if (useEditorStore.getState().duration === 0) {
          useEditorStore.setState({ duration });
        }

        setAgentState("ingestion", { status: "done", progress: 100 });
        setProgress(20);

        setProcessing(true, "transcribing");
        setAgentState("transcription", { status: "working", progress: 0 });
        toast.info("Reading video content...");
        activeRunIdRef.current = crypto.randomUUID();
        transcription.init();
        transcription.transcribe(audioData, sampleRate);
      })
      .catch((audioError: unknown) => {
        clearTimeout(timeoutId);
        const msg = audioError instanceof Error ? audioError.message : String(audioError);
        const lowerMsg = msg.toLowerCase();

        let infoMsg =
          "Video loaded — AI analysis unavailable. Mark clips manually or upload an MP4 for full analysis.";

        if (audioError instanceof Error && audioError.name === "AbortError") {
          infoMsg = "Analysis timed out — video is ready for manual editing.";
        } else if (
          lowerMsg.includes("bot detection") ||
          lowerMsg.includes("sign in") ||
          lowerMsg.includes("audio extraction failed")
        ) {
          infoMsg =
            "Auto-analysis unavailable for this video (server-side restriction). The video is still loaded — mark clips manually or upload an MP4.";
        } else if (lowerMsg.includes("network error") || lowerMsg.includes("unreachable")) {
          infoMsg = "Could not reach the server — check your connection and try again.";
        } else if (lowerMsg.includes("private")) {
          infoMsg = "This video is private. Try a public YouTube video.";
        } else if (lowerMsg.includes("video unavailable") || lowerMsg.includes("yt-dlp")) {
          infoMsg =
            "This video is unavailable — it may be region-locked. Try uploading the MP4 directly.";
        }

        toast.info(infoMsg, { duration: 6000 });
        setAgentState("ingestion", { status: "error" });
        setProcessing(false, "idle");
        useEditorStore
          .getState()
          .failIngest(
            "analysis_failed",
            "Auto-analysis unavailable. Retry analysis or upload an MP4.",
          );
      });

    // GCS upload is owned by useIngestLifecycle.ingestFile (canonical path).
    // Do not duplicate presigned PUT here — avoids double GCS ops / cost.
  }, [setProcessing, setProgress, setAgentState, setWaveformPeaks, transcription]);

  useEffect(() => {
    if (
      transcription.lastMessage?.type === "complete" &&
      transcription.lastMessage.stage === "process"
    ) {
      type XenovaChunk = {
        text?: string;
        timestamp?: [number, number];
        start?: number;
        end?: number;
      };
      type XenovaTranscript = { text?: string; chunks?: XenovaChunk[] };
      if (!activeRunIdRef.current) return;

      const raw = transcription.lastMessage.payload.transcript as unknown as
        | XenovaTranscript
        | null
        | undefined;
      if (!raw) return;

      const transcript: Transcript = {
        text: raw.text ?? "",
        chunks: (raw.chunks ?? []).map((c) => ({
          text: c.text ?? "",
          start: c.start ?? c.timestamp?.[0] ?? 0,
          end: c.end ?? c.timestamp?.[1] ?? 0,
        })),
      };

      setTranscript(transcript);
      setAgentState("transcription", { status: "done", progress: 100 });

      setProcessing(true, "analyzing");
      setAgentState("viralAnalysis", { status: "working", progress: 10 });
      toast.info("Finding the best clips...");

      const { sourceUrl } = useEditorStore.getState();

      interface AnalysisResponse {
        suggestedClips?: Partial<Clip>[];
      }
      interface AnalysisError {
        response?: { data?: { detail?: string; message?: string } };
        message?: string;
      }

      const capturedRunId = activeRunIdRef.current;
      analysis
        .analyzeWithBackend({
          videoId: sourceUrl || "local-video",
          transcript: transcript.chunks,
          duration: useEditorStore.getState().duration || 0,
          user_id: userId,
        })
        .then(async (response: AnalysisResponse) => {
          if (activeRunIdRef.current !== capturedRunId) return;
          const mapped: Clip[] = response.suggestedClips
            ? response.suggestedClips.map((s) => ({
              ...s,
              aspectRatio: "9:16" as const,
              captionsEnabled: true,
              status: "ready" as const,
              id: s.id ?? crypto.randomUUID(),
              start: s.start ?? 0,
              end: s.end ?? 0,
              confidence: s.confidence ?? 0,
              reason: s.reason ?? "",
            }))
            : [];

          if (mapped.length) {
            setAgentState("viralAnalysis", { status: "done", progress: 100 });
            setAgentState("reframing", { status: "working", progress: 50 });
            setSuggestions(mapped);
            setAgentState("reframing", { status: "done", progress: 100 });
            toast.success("AI Analysis complete! Suggestions ready.");
          } else {
            setAgentState("viralAnalysis", { status: "done", progress: 100 });
            toast.info("Transcript ready — no clip suggestions returned.");
          }

          setProcessing(false, "ready");
          setProgress(100);
          await persistArtifactsAndReady({ suggestions: mapped });
        })
        .catch(async (err: AnalysisError) => {
          if (activeRunIdRef.current !== capturedRunId) return;
          const msg =
            err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            "Analysis failed";
          toast.error(typeof msg === "string" ? msg : "Analysis failed. Please try again.");
          setAgentState("viralAnalysis", { status: "error" });
          setProcessing(false, "idle");
          useEditorStore
            .getState()
            .failIngest(
              "analysis_failed",
              typeof msg === "string" ? msg : "Analysis failed. Retry to continue.",
            );
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
    userId,
  ]);

  useEffect(() => {
    const error = transcription.error || analysis.error;
    if (error) {
      toast.error(error);
      if (transcription.error) setAgentState("transcription", { status: "error" });
      if (analysis.error) setAgentState("viralAnalysis", { status: "error" });
      setProcessing(false, "idle");
      useEditorStore.getState().failIngest("analysis_failed", error);
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
