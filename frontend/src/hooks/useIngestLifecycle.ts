/**
 * M2/M3 — Canonical staged ingest lifecycle (identify → … → ready|failed).
 * All Studio ingest entry points must route through this hook.
 * No Gemini calls here. Kernel projectize uses existing ensureStudioProject.
 */

"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { getVideoInfo } from "@/lib/api";
import { parseYouTubeId } from "@/lib/youtube-utils";
import { trackEvent } from "@/lib/analytics";
import {
  FALLBACK_INGEST_POLICY,
  fetchIngestPolicy,
  validateFileAgainstPolicy,
} from "@/lib/studio/ingestPolicy";
import {
  fingerprintDirectUrl,
  fingerprintFile,
  fingerprintYouTube,
  isDirectVideoUrl,
} from "@/lib/studio/ingestFsm";
import { loadIngestArtifact } from "@/lib/studio/ingestArtifacts";
import { saveIngestSession } from "@/lib/studio/ingestSession";
import {
  ensureStudioProject,
  isStudioProjectKernelEnabled,
} from "@/lib/studio/projectKernel";
import { useEditorStore } from "@/stores/editorStore";
import { useAIPanel } from "@/stores/aiPanelStore";
import {
  enterReadyPreservingMedia,
  PIPELINE_HARD_TIMEOUT_MS,
} from "@/hooks/useMediaPipeline";

export type LastIngestAttempt =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string };

async function projectizeAfterMeta(title: string): Promise<void> {
  const store = useEditorStore.getState();
  store.setIngestStage("projectize");
  if (!isStudioProjectKernelEnabled()) return;
  try {
    await ensureStudioProject({
      title: title || "Studio Project",
      active_run_id: useEditorStore.getState().runId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Project bind failed";
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ingest] projectize soft-fail:", msg);
    }
    toast.warning("Project sync deferred — you can still edit locally.");
  }
}

function persistUrlSession(opts: {
  url: string;
  fingerprint: string;
  kind: "youtube" | "direct_url";
  title?: string | null;
}): void {
  saveIngestSession({
    v: 1,
    url: opts.url,
    fingerprint: opts.fingerprint,
    kind: opts.kind,
    title: opts.title ?? null,
  });
}

async function applyCachedArtifact(
  fingerprint: string,
  isLive: () => boolean = () => true,
): Promise<boolean> {
  const cached = await loadIngestArtifact(fingerprint);
  if (!cached || !isLive()) return false;
  const store = useEditorStore.getState();
  store.setIngestMeta({ fromCache: true, fingerprint });
  store.setTranscript(cached.transcript);
  store.setSuggestions(cached.suggestions);
  store.setSilenceSegments(cached.silenceSegments);
  if (cached.waveformPeaks) store.setWaveformPeaks(cached.waveformPeaks);
  if (cached.duration > 0) store.setDuration(cached.duration);
  store.setProcessing(false, "ready");
  store.setProgress(100);
  store.setAgentState("ingestion", { status: "done", progress: 100 });
  store.setAgentState("transcription", { status: "done", progress: 100 });
  store.setAgentState("viralAnalysis", { status: "done", progress: 100 });
  store.setIngestStage("analyze");
  store.setIngestStage("ready");
  toast.success("Restored analysis from cache — no recompute needed.");
  return true;
}

export function useIngestLifecycle(opts: {
  runPipeline: () => void | Promise<void>;
  cancelPipeline: () => void;
}) {
  const { runPipeline, cancelPipeline } = opts;
  const uploadAbortRef = useRef<AbortController | null>(null);
  const lastFileRef = useRef<File | null>(null);
  const lastAttemptRef = useRef<LastIngestAttempt | null>(null);
  /** Hard bound covering the whole ingest (policy fetch, projectize, pipeline). */
  const ingestHardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped on every new ingest / cancel so stale awaits cannot mutate store. */
  const ingestGenRef = useRef(0);
  const { setVideoContext } = useAIPanel();

  const {
    setSourceFile,
    setSourceUrl,
    setProcessing,
    setVideoMetadata,
    setThumbnailUrl,
    setIngestStage,
    setIngestMeta,
    failIngest,
    resetIngestLifecycle,
  } = useEditorStore();

  const beginIngest = useCallback(() => {
    ingestGenRef.current += 1;
    uploadAbortRef.current?.abort();
    cancelPipeline();
    resetIngestLifecycle();
    useEditorStore.getState().setProcessing(false, "idle");
    setIngestStage("identify");
    return ingestGenRef.current;
  }, [cancelPipeline, resetIngestLifecycle, setIngestStage]);

  const bumpGen = useCallback(() => {
    ingestGenRef.current += 1;
    return ingestGenRef.current;
  }, []);

  const isCurrent = useCallback((gen: number) => gen === ingestGenRef.current, []);

  const clearIngestHardTimeout = useCallback(() => {
    if (ingestHardTimeoutRef.current) {
      clearTimeout(ingestHardTimeoutRef.current);
      ingestHardTimeoutRef.current = null;
    }
  }, []);

  const armIngestHardTimeout = useCallback(
    (gen: number) => {
      clearIngestHardTimeout();
      ingestHardTimeoutRef.current = setTimeout(() => {
        ingestHardTimeoutRef.current = null;
        if (ingestGenRef.current !== gen) return;
        const st = useEditorStore.getState();
        if (st.ingestStage === "ready" || st.ingestStage === "failed") return;
        cancelPipeline();
        enterReadyPreservingMedia(
          "Auto-analysis timed out. Video is ready — retry transcript or export. AI chat waits for captions.",
        );
      }, PIPELINE_HARD_TIMEOUT_MS);
    },
    [cancelPipeline, clearIngestHardTimeout],
  );

  const cancelUpload = useCallback(() => {
    bumpGen();
    clearIngestHardTimeout();
    uploadAbortRef.current?.abort();
    cancelPipeline();
    failIngest("cancelled", "Ingest cancelled.");
  }, [bumpGen, cancelPipeline, failIngest, clearIngestHardTimeout]);

  /** Re-run analyze only — requires media already loaded (LeftPanel retry, etc.). */
  const retryAnalyze = useCallback(() => {
    const st = useEditorStore.getState();
    if (!st.sourceUrl && !st.sourceFile) {
      failIngest("unknown", "No media loaded to re-analyze.");
      toast.error("Load a video first, then retry analysis.");
      return;
    }
    cancelPipeline();
    st.setProcessing(false, "idle");
    st.setIngestMeta({ fromCache: false });
    const stage = useEditorStore.getState().ingestStage;
    if (stage === "ready" || stage === "failed") {
      st.setIngestStage("analyze");
    } else if (stage === "analyze") {
      /* already analyzing — restart pipeline below */
    } else if (stage === "idle") {
      st.setIngestStage("identify");
      st.setIngestStage("validate");
      st.setIngestStage("acquire_meta");
      st.setIngestStage("projectize");
      st.setIngestStage("analyze");
    } else {
      // Mid-flight with source already bound — snap to projectize then analyze.
      useEditorStore.setState({ ingestStage: "projectize" });
      useEditorStore.getState().setIngestStage("analyze");
    }
    toast.info("Retrying analysis…");
    void runPipeline();
  }, [cancelPipeline, failIngest, runPipeline]);

  const ingestUrl = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) {
        failIngest("invalid_url", "Please paste a YouTube URL or direct video URL first.");
        toast.error("Please paste a YouTube URL or direct video URL first.");
        return;
      }

      lastFileRef.current = null;
      lastAttemptRef.current = { kind: "url", url };
      const gen = beginIngest();
      if (!isCurrent(gen)) return;
      setIngestMeta({ sourceKind: null, fromCache: false, uploadProgress: null });

      const ytId = parseYouTubeId(url);
      const direct = isDirectVideoUrl(url);
      if (!ytId && !direct) {
        failIngest(
          "unsupported_provider",
          "Only YouTube URLs or direct MP4/WebM/MOV links are supported.",
        );
        toast.error("Unsupported URL. Use YouTube or a direct video link.");
        return;
      }
      setIngestMeta({
        sourceKind: ytId ? "youtube" : "direct_url",
      });
      setIngestStage("validate");

      if (ytId) {
        setIngestStage("acquire_meta");
        setProcessing(true, "loading");
        toast.info("Fetching video details…");
        try {
          const info = await getVideoInfo(url);
          if (!isCurrent(gen)) return;
          if (info.code === "YOUTUBE_FETCH_FAILED") {
            failIngest(
              "meta_fetch_failed",
              "YouTube metadata unavailable. Upload an MP4 instead.",
            );
            toast.warning(
              "YouTube server-side access failed. Upload MP4 for AI analysis.",
              { duration: 7000 },
            );
            return;
          }

          const fingerprint = fingerprintYouTube(info.id ?? ytId);
          setIngestMeta({ fingerprint });

          if (info.duration && info.duration > 1800) {
            toast.warning(
              `This video is ${Math.round(info.duration / 60)} minutes. Browser AI works best under 30 minutes.`,
              { duration: 8000 },
            );
          }

          if (info.thumbnail) setThumbnailUrl(info.thumbnail);
          toast.success(`Found: ${info.title}`);
          setVideoContext({
            id: info.id ?? ytId,
            title: info.title ?? "YouTube Video",
            transcript: "",
          });
          setVideoMetadata({
            id: info.id ?? ytId,
            url,
            title: info.title ?? "YouTube Video",
            duration: info.duration ?? 0,
            nativeWidth: 1280,
            nativeHeight: 720,
            fps: 30,
          });
          setSourceUrl(url);
          trackEvent({
            name: "video_loaded",
            props: { source: "youtube", durationSec: Math.round(info.duration ?? 0) },
          });

          await projectizeAfterMeta(info.title ?? "YouTube Video");
          if (!isCurrent(gen)) return;
          persistUrlSession({
            url,
            fingerprint,
            kind: "youtube",
            title: info.title,
          });

          if (await applyCachedArtifact(fingerprint, () => isCurrent(gen))) return;
          if (!isCurrent(gen)) return;

          setIngestStage("analyze");
          void runPipeline();
        } catch (error: unknown) {
          if (!isCurrent(gen)) return;
          let errMsg = "Could not load this video. Try another link.";
          if (error && typeof error === "object" && "isAxiosError" in error) {
            const axErr = error as {
              code?: string;
              response?: { status: number; data: { detail?: string; code?: string } };
            };
            if (axErr.code === "ERR_NETWORK") {
              errMsg = "Network Error: Could not connect to the backend server.";
            } else if (axErr.response?.data?.code === "YOUTUBE_FETCH_FAILED") {
              failIngest(
                "meta_fetch_failed",
                "YouTube metadata unavailable. Upload an MP4 instead.",
              );
              toast.warning("YouTube server-side access failed. Upload MP4 instead.", {
                duration: 7000,
              });
              return;
            } else if (axErr.response) {
              const { formatApiDetail } = await import("@/lib/authenticatedFetch");
              errMsg = formatApiDetail(
                axErr.response.data?.detail,
                axErr.response.status,
              );
            }
          } else if (error instanceof Error) {
            errMsg = error.message || errMsg;
          }
          failIngest("meta_fetch_failed", errMsg);
          toast.error(errMsg);
        }
        return;
      }

      setIngestStage("acquire_meta");
      const fingerprint = fingerprintDirectUrl(url);
      setIngestMeta({ fingerprint });
      setVideoMetadata({
        id: url,
        url,
        title: url.split("/").pop() ?? "Video",
        duration: 0,
        nativeWidth: 1280,
        nativeHeight: 720,
        fps: 30,
      });
      setSourceUrl(url);
      trackEvent({ name: "video_loaded", props: { source: "upload", durationSec: 0 } });
      await projectizeAfterMeta(url.split("/").pop() ?? "Video");
      if (!isCurrent(gen)) return;
      persistUrlSession({
        url,
        fingerprint,
        kind: "direct_url",
        title: url.split("/").pop(),
      });
      if (await applyCachedArtifact(fingerprint, () => isCurrent(gen))) return;
      if (!isCurrent(gen)) return;
      setIngestStage("analyze");
      void runPipeline();
    },
    [
      beginIngest,
      failIngest,
      isCurrent,
      runPipeline,
      setIngestMeta,
      setIngestStage,
      setProcessing,
      setSourceUrl,
      setThumbnailUrl,
      setVideoContext,
      setVideoMetadata,
    ],
  );

  const ingestFile = useCallback(
    async (file: File) => {
      lastFileRef.current = file;
      lastAttemptRef.current = { kind: "file", file };
      const gen = beginIngest();
      if (!isCurrent(gen)) return;
      armIngestHardTimeout(gen);
      setIngestMeta({
        sourceKind: "file",
        fromCache: false,
        fingerprint: fingerprintFile(file),
        uploadProgress: null,
      });

      setIngestStage("validate");
      const policy = await fetchIngestPolicy().catch(() => FALLBACK_INGEST_POLICY);
      if (!isCurrent(gen)) return;
      const v = validateFileAgainstPolicy(file, policy);
      if (!v.ok) {
        failIngest(
          v.code === "too_large" ? "too_large" : "unsupported_format",
          v.message,
        );
        toast.error(v.message);
        return;
      }
      if (file.size > policy.warn_bytes) {
        toast.warning("Large file — first analysis may take a while.", { duration: 5000 });
      }

      setIngestStage("acquire_meta");
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = new AbortController();

      const blobUrl = URL.createObjectURL(file);
      setSourceFile(file, blobUrl);
      setVideoMetadata({
        id: fingerprintFile(file),
        url: blobUrl,
        title: file.name || "Upload",
        duration: 0,
        nativeWidth: 0,
        nativeHeight: 0,
        fps: 0,
      });
      trackEvent({ name: "video_loaded", props: { source: "upload", durationSec: 0 } });

      // Local-first: skip GCS PUT on ingest (FinOps). Cloud upload waits for Export final.
      if (!isCurrent(gen)) return;
      const fingerprint = fingerprintFile(file);
      setIngestMeta({ fingerprint, uploadProgress: null });
      await projectizeAfterMeta(file.name || "Upload");
      if (!isCurrent(gen)) return;

      if (await applyCachedArtifact(fingerprint, () => isCurrent(gen))) return;
      if (!isCurrent(gen)) return;

      setIngestStage("analyze");
      void runPipeline();
    },
    [
      beginIngest,
      failIngest,
      isCurrent,
      runPipeline,
      setIngestMeta,
      setIngestStage,
      setSourceFile,
      armIngestHardTimeout,
    ],
  );

  const cancelAnalyze = useCallback(() => {
    bumpGen();
    clearIngestHardTimeout();
    uploadAbortRef.current?.abort();
    cancelPipeline();
    failIngest("cancelled", "Processing cancelled.");
    toast.info("Processing cancelled.");
  }, [bumpGen, cancelPipeline, failIngest, clearIngestHardTimeout]);

  const retryLastIngest = useCallback(() => {
    const attempt = lastAttemptRef.current;
    if (attempt?.kind === "file") {
      void ingestFile(attempt.file);
      return;
    }
    if (attempt?.kind === "url") {
      void ingestUrl(attempt.url);
      return;
    }
    toast.error("Nothing to retry — import a video first.");
  }, [ingestFile, ingestUrl]);

  return {
    ingestUrl,
    ingestFile,
    retryAnalyze,
    retryLastIngest,
    cancelUpload,
    cancelAnalyze,
    lastFileRef,
    lastAttemptRef,
    uploadAbortRef,
  };
}
