"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useTranscription } from "./useTranscription";
import { useAnalysis } from "./useAnalysis";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { toast } from "sonner";
import { API_URL } from "@/lib/api";
import { useSession } from "next-auth/react";
import type { Clip, Transcript } from "@/types/pipeline";
import { saveIngestArtifact } from "@/lib/studio/ingestArtifacts";
import { isDirectVideoUrl, type IngestStage } from "@/lib/studio/ingestFsm";
import { saveIngestSession } from "@/lib/studio/ingestSession";
import { parseYouTubeId } from "@/lib/youtube-utils";
import { shouldPreserveEditorSession } from "@/lib/aiCommandHonesty";

/** Whisper model fetch/transcribe can hang with no worker error. Bound it. */
const WHISPER_TRANSCRIBE_TIMEOUT_MS = 45_000;
/** decodeAudioData does not honor AbortSignal — race it or local ingest hangs. */
const AUDIO_EXTRACT_TIMEOUT_MS = 20_000;
/** Whole-pipeline bound: a hung decode/worker must never trap the editor. */
export const PIPELINE_HARD_TIMEOUT_MS = 75_000;

function raceTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => {
      const err = new Error(message);
      err.name = "AbortError";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(id);
        resolve(value);
      },
      (error) => {
        clearTimeout(id);
        reject(error);
      },
    );
  });
}

export function enterReadyPreservingMedia(message: string): void {
  const store = useEditorStore.getState();
  const hasMedia = Boolean(store.sourceFile || store.sourceUrl);
  if (!shouldPreserveEditorSession(hasMedia)) {
    toast.error(message);
    store.failIngest("analysis_failed", message);
    return;
  }
  toast.warning(message);
  store.setAgentState("transcription", { status: "error" });
  store.setProcessing(false, "ready");
  if (store.ingestStage === "failed") {
    store.setIngestStage("analyze");
  }
  void persistArtifactsAndReady({ suggestions: [] });
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
    setAudioData,
    setAudioExtractStatus,
  } = useEditorStore();

  const transcription = useTranscription();
  const analysis = useAnalysis();

  const abortControllerRef = useRef<AbortController | null>(null);
  const whisperTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pipelineTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const transcriptionRef = useRef(transcription);
  useEffect(() => {
    transcriptionRef.current = transcription;
  });

  const activeRunIdRef = useRef<string | null>(null);

  const clearWhisperTimeout = useCallback(() => {
    if (whisperTimeoutRef.current) {
      clearTimeout(whisperTimeoutRef.current);
      whisperTimeoutRef.current = null;
    }
  }, []);

  const clearPipelineTimeout = useCallback(() => {
    if (pipelineTimeoutRef.current) {
      clearTimeout(pipelineTimeoutRef.current);
      pipelineTimeoutRef.current = null;
    }
  }, []);

  const clearPipelineTimeoutRef = useRef(clearPipelineTimeout);
  useEffect(() => {
    clearPipelineTimeoutRef.current = clearPipelineTimeout;
  });

  const clearWhisperTimeoutRef = useRef(clearWhisperTimeout);
  useEffect(() => {
    clearWhisperTimeoutRef.current = clearWhisperTimeout;
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => {
    clearWhisperTimeout();
    clearPipelineTimeout();
    transcriptionRef.current.terminate();
  }, [clearWhisperTimeout, clearPipelineTimeout]);

  const cancelPipeline = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRunIdRef.current = null;
    clearWhisperTimeout();
    clearPipelineTimeout();
    transcriptionRef.current.terminate();
  }, [clearWhisperTimeout, clearPipelineTimeout]);

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
    if (stageNow === "projectize" || stageNow === "failed") {
      useEditorStore.getState().setIngestStage("analyze");
    } else if (stageNow !== "analyze" && stageNow !== "ready") {
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
        // Tokenised when the user is authenticated; falls back to the plain
        // proxy URL otherwise. extractAudioData() uses a bare fetch() and
        // cannot send an Authorization header, so the token rides the URL.
        const { getAuthedAudioUrl } = await import("@/lib/api");
        source = await getAuthedAudioUrl(source);
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    setProcessing(true, "loading");
    setAudioExtractStatus("extracting");
    setAgentState("ingestion", { status: "working", progress: 10 });
    setProgress(10);
    toast.info("Preparing content for analysis…");

    clearPipelineTimeoutRef.current();
    pipelineTimeoutRef.current = setTimeout(() => {
      pipelineTimeoutRef.current = null;
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      activeRunIdRef.current = null;
      clearWhisperTimeoutRef.current();
      transcriptionRef.current.terminate();
      if (useEditorStore.getState().audioExtractStatus === "extracting") {
        useEditorStore.getState().setAudioData(null);
      }
      enterReadyPreservingMedia(
        "Auto-analysis timed out. Video is ready — retry transcript or export. AI chat waits for captions.",
      );
    }, PIPELINE_HARD_TIMEOUT_MS);

    void raceTimeout(
      extractAudioData(source, controller.signal),
      AUDIO_EXTRACT_TIMEOUT_MS,
      "Audio extract timed out",
    )
      .then(({ audioData, sampleRate, duration }) => {
        clearTimeout(timeoutId);
        setAudioData(audioData);

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
        clearWhisperTimeout();
        whisperTimeoutRef.current = setTimeout(() => {
          whisperTimeoutRef.current = null;
          transcriptionRef.current.terminate();
          enterReadyPreservingMedia(
            "On-device transcript timed out. Video is ready — retry transcript or export. AI chat waits for captions.",
          );
        }, WHISPER_TRANSCRIBE_TIMEOUT_MS);
      })
      .catch((audioError: unknown) => {
        clearTimeout(timeoutId);
        const msg = audioError instanceof Error ? audioError.message : String(audioError);
        const lowerMsg = msg.toLowerCase();

        let infoMsg =
          "Video loaded — transcript unavailable. Export works; AI chat waits for a transcript retry.";

        if (audioError instanceof Error && audioError.name === "AbortError") {
          infoMsg = "Transcript timed out. Video is ready — retry or export without AI chat.";
        } else if (
          lowerMsg.includes("bot detection") ||
          lowerMsg.includes("sign in") ||
          lowerMsg.includes("audio extraction failed")
        ) {
          infoMsg =
            "Auto-analysis unavailable for this video. The video is still loaded — retry or export.";
        } else if (lowerMsg.includes("network error") || lowerMsg.includes("unreachable")) {
          infoMsg = "Could not reach the server — video is still loaded. Retry when online.";
        } else if (lowerMsg.includes("private")) {
          infoMsg = "This video is private. Try a public YouTube video.";
        } else if (lowerMsg.includes("video unavailable") || lowerMsg.includes("yt-dlp")) {
          infoMsg =
            "This video is unavailable — it may be region-locked. Try uploading the MP4 directly.";
        }

        setAgentState("ingestion", { status: "error" });
        setAudioData(null);
        enterReadyPreservingMedia(infoMsg);
      });

    // GCS upload is owned by useIngestLifecycle.ingestFile (canonical path).
    // Do not duplicate presigned PUT here — avoids double GCS ops / cost.
  }, [
    setProcessing,
    setProgress,
    setAgentState,
    setAudioData,
    setAudioExtractStatus,
    transcription,
    clearWhisperTimeout,
  ]);

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
      clearWhisperTimeout();

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
          clearPipelineTimeoutRef.current();
          await persistArtifactsAndReady({ suggestions: mapped });
        })
        .catch(async (err: AnalysisError) => {
          if (activeRunIdRef.current !== capturedRunId) return;
          clearPipelineTimeoutRef.current();
          const msg =
            err?.response?.data?.detail ||
            err?.response?.data?.message ||
            err?.message ||
            "Analysis failed";
          toast.warning(
            typeof msg === "string"
              ? `Clip analysis failed — transcript is still ready. ${msg}`
              : "Clip analysis failed — transcript is still ready. You can chat and export.",
          );
          setAgentState("viralAnalysis", { status: "error" });
          setProcessing(false, "ready");
          await persistArtifactsAndReady({ suggestions: [] });
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
    clearWhisperTimeout,
  ]);

  useEffect(() => {
    if (transcription.error) {
      // A worker that never spawned has no active run — nothing to unwind.
      if (!activeRunIdRef.current) return;
      activeRunIdRef.current = null;
      clearWhisperTimeout();
      enterReadyPreservingMedia(
        `On-device transcript failed. Video is ready — retry or export. ${transcription.error}`,
      );
      return;
    }
    if (analysis.error) {
      const store = useEditorStore.getState();
      const hasTranscript = (store.transcript?.chunks?.length ?? 0) > 0;
      toast.warning(
        hasTranscript
          ? "Clip analysis failed — transcript is still ready. You can chat and export."
          : analysis.error,
      );
      setAgentState("viralAnalysis", { status: "error" });
      if (hasTranscript) {
        setProcessing(false, "ready");
        void persistArtifactsAndReady({ suggestions: [] });
      } else {
        enterReadyPreservingMedia(
          analysis.error ||
            "Clip analysis failed. Video is ready — retry transcript or export.",
        );
      }
    }
  }, [transcription.error, analysis.error, setProcessing, setAgentState, clearWhisperTimeout]);

  return {
    runPipeline,
    cancelPipeline,
    status: transcription.status || analysis.status,
    progress: transcription.progress || analysis.progress,
    stage: useEditorStore.getState().currentStage,
  };
}
