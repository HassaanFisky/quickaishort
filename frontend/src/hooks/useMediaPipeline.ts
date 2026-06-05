"use client";

import { useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useTranscription } from "./useTranscription";
import { useAnalysis } from "./useAnalysis";
import { extractAudioData } from "@/lib/utils/audioExtractor";
import { toast } from "sonner";
import { API_URL, getAudioUrl, requestPresignedUploadUrl, uploadFileToGcs } from "@/lib/api";
import { useSession } from "next-auth/react";
import type { Clip, Transcript } from "@/types/pipeline";

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
    setWaveformPeaks,
    setSourceGcsPath,
  } = useEditorStore();

  const transcription = useTranscription();
  const analysis = useAnalysis();

  const abortControllerRef = useRef<AbortController | null>(null);

  // transcription is a plain object recreated each render (standard hook pattern).
  // Storing it in a ref gives cancelPipeline a stable, dep-free closure that always
  // calls the current terminate function without adding transcription to the callback deps.
  const transcriptionRef = useRef(transcription);
  useEffect(() => { transcriptionRef.current = transcription; });

  // Run-ID guard: each runPipeline invocation writes a UUID here.
  // cancelPipeline clears it to null. The transcription-complete and
  // analyzeWithBackend handlers check this ref before writing to the store,
  // preventing stale messages from a terminated worker reaching the UI.
  const activeRunIdRef = useRef<string | null>(null);

  // Cleanup only — terminate if a worker was ever created. initWorker is NOT called
  // here to avoid setting worker status "loading" on mount before any user action.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => transcriptionRef.current.terminate(), []);

  /** Cancels the running pipeline: aborts the audio fetch, terminates the
   *  Whisper worker, and invalidates the run-ID so any in-flight async
   *  completions are discarded. Stable callback — no deps needed. */
  const cancelPipeline = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    activeRunIdRef.current = null;
    transcriptionRef.current.terminate();
  }, []);

  const runPipeline = useCallback(async () => {
    // Guard: a pipeline is already live. Prevents concurrent runs from rapid
    // Generate clicks or retry-analysis events arriving before the first run finishes.
    if (useEditorStore.getState().isProcessing) return;

    const { sourceFile, sourceUrl } = useEditorStore.getState();
    let source: File | string | null = sourceFile || sourceUrl;

    if (!source) {
      toast.error("No video source found");
      return;
    }

    // Route YouTube URLs through the backend audio endpoint.
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

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    setProcessing(true, "loading");
    setAgentState("ingestion", { status: "working", progress: 10 });
    setProgress(10);

    // ── Audio extraction runs in background — video already shows via /api/proxy-video.
    // Transcription and analysis follow when extraction completes.
    toast.info("Preparing content for viral analysis...");

    void extractAudioData(source, controller.signal)
      .then(({ audioData, sampleRate, duration }) => {
        clearTimeout(timeoutId);
        // Compute 120-bar peaks here (O(1) per bar via stride sampling) and store
        // only those — never persist the raw Float32Array in Zustand. A 4-hour video
        // produces a ~920 MB Float32Array; storing it globally would cause OOM on
        // mobile and block the main thread for 77ms+ in BottomDock's useMemo.
        setWaveformPeaks(computeWaveformPeaks(audioData));
        // audioData is passed to the worker below; local ref is GC-eligible once
        // the .then() callback returns.

        if (useEditorStore.getState().duration === 0) {
          useEditorStore.setState({ duration });
        }

        setAgentState("ingestion", { status: "done", progress: 100 });
        setProgress(20);

        setProcessing(true, "transcribing");
        setAgentState("transcription", { status: "working", progress: 0 });
        toast.info("Reading video content...");
        // Stamp the active run-ID before starting the worker so the
        // transcription-complete handler can verify this message belongs
        // to the current pipeline (not a terminated one).
        activeRunIdRef.current = crypto.randomUUID();
        // Lazy init — idempotent (useWorker guards against re-init with workerRef check).
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
          infoMsg = "This video is unavailable — it may be region-locked. Try uploading the MP4 directly.";
        }

        toast.info(infoMsg, { duration: 6000 });
        setAgentState("ingestion", { status: "error" });
        setProcessing(false, "idle");
      });

    // ── GCS upload runs in parallel for local File sources only.
    // Sets sourceGcsPath so the server render worker can read directly from GCS
    // instead of downloading via yt-dlp.  Failure is silent — MediaRecorder
    // fallback remains the safety net.
    const fileSource = useEditorStore.getState().sourceFile;
    if (fileSource instanceof File) {
      void requestPresignedUploadUrl(fileSource.name, fileSource.type || "video/mp4")
        .then(({ presigned_url, gcs_path }) =>
          uploadFileToGcs(presigned_url, fileSource, fileSource.type || "video/mp4").then(
            () => setSourceGcsPath(gcs_path),
          ),
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[useMediaPipeline] GCS upload failed (non-fatal):", msg);
        });
    }
  }, [setProcessing, setProgress, setAgentState, setWaveformPeaks, setSourceGcsPath, transcription]);

  // Handle Transcription Complete
  useEffect(() => {
    if (
      transcription.lastMessage?.type === "complete" &&
      transcription.lastMessage.stage === "process"
    ) {
      // @xenova/transformers ASR returns { text, chunks: [{ text, timestamp:[s,e] }] }.
      // Our internal TranscriptChunk shape expects { text, start, end }.
      // Normalize at this single boundary so every downstream consumer gets
      // the correct shape: CaptionOverlay, generateSRT, VideoWorkspace word tokens,
      // RightPanel preflight filter, and analyzeWithBackend.
      type XenovaChunk = { text?: string; timestamp?: [number, number]; start?: number; end?: number };
      type XenovaTranscript = { text?: string; chunks?: XenovaChunk[] };
      // Discard if this completion belongs to a cancelled run. A terminated
      // worker can still deliver one final message before the thread dies.
      if (!activeRunIdRef.current) return;

      const raw = transcription.lastMessage.payload.transcript as unknown as XenovaTranscript | null | undefined;
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

      // 3. Analyze with Backend (Gemini)
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

      // Capture run-ID so the promise callback can verify it hasn't been
      // superseded by a cancel + re-generate while the HTTP request was in flight.
      const capturedRunId = activeRunIdRef.current;
      analysis.analyzeWithBackend({
        videoId: sourceUrl || "local-video",
        transcript: transcript.chunks,
        duration: useEditorStore.getState().duration || 0,
        user_id: userId,
      }).then((response: AnalysisResponse) => {
        if (activeRunIdRef.current !== capturedRunId) return; // stale — discard
        if (response.suggestedClips) {
          setAgentState("viralAnalysis", { status: "done", progress: 100 });
          setAgentState("reframing", { status: "working", progress: 50 });

          setSuggestions(
            response.suggestedClips.map((s) => ({
              ...s,
              aspectRatio: "9:16" as const,
              captionsEnabled: true,
              status: "ready" as const,
              id: s.id ?? crypto.randomUUID(),
              start: s.start ?? 0,
              end: s.end ?? 0,
              confidence: s.confidence ?? 0,
              reason: s.reason ?? "",
            })),
          );

          setAgentState("reframing", { status: "done", progress: 100 });
          setProcessing(false, "ready");
          setProgress(100);
          toast.success("AI Analysis complete! Suggestions ready.");
        }
      }).catch((err: AnalysisError) => {
        const msg =
          err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Analysis failed";
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
