"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import type { Channel } from "pusher-js";
import { toast } from "sonner";

import { LOOP_COPY } from "@/lib/studio/computePlane";
import { uploadLocalFileToGcs } from "@/lib/studio/localCloudUpload";
import { generateSRT } from "@/lib/utils/srtGenerator";
import { useEditorStore } from "@/stores/editorStore";
import {
  API_URL,
  buildExportDownloadUrl,
  cancelExportJob,
  getExportStatus,
  requestExport,
} from "@/lib/api";
import { formatApiDetail } from "@/lib/authenticatedFetch";
import { getSharedPusher } from "@/lib/pusherClient";
import type {
  CanvasOverlay,
  ExportAspect,
  ExportQuality,
  ExportRequestPayload,
  ExportStatusResponse,
} from "@/types/export";

interface UseServerExportArgs {
  userId: string;
}

interface ExportClipOptions {
  quality?: ExportQuality;
  aspectRatio?: ExportAspect;
  captionsEnabled?: boolean;
  watermarkEnabled?: boolean;
}

/** Aggressive poll when Pusher unavailable. */
const POLL_INTERVAL_MS = 3000;
/** Slower belt-and-braces when realtime is connected. */
const POLL_INTERVAL_PUSHER_MS = 12_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function useServerExport({ userId }: UseServerExportArgs) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastDownloadUrl, setLastDownloadUrl] = useState<string | null>(null);

  const channelRef = useRef<Channel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unbind_all();
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const triggerDownload = useCallback((url: string, suggestedName: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = suggestedName;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const resetExportState = useCallback(() => {
    setExportDone(false);
    setExportError(null);
    setLastDownloadUrl(null);
    setExportProgress(0);
  }, []);

  const activeJobIdRef = useRef(activeJobId);
  activeJobIdRef.current = activeJobId;

  // Must stay identity-stable. An inline cancelExport in the hook return
  // made ServerExportHost call setControllers every render → empty /editor
  // max-update-depth under StrictMode.
  const cancelExport = useCallback(async () => {
    const jobId = activeJobIdRef.current;
    cleanup();
    setIsExporting(false);
    setExportProgress(0);
    setActiveJobId(null);
    if (!jobId) {
      toast.info("Export cancelled.");
      return;
    }
    try {
      await cancelExportJob(jobId);
      toast.success("Export cancelled.");
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        toast.error(
          formatApiDetail(err.response?.data?.detail, err.response?.status ?? 500) ||
            "Could not cancel export on server.",
        );
      } else {
        toast.error("Could not cancel export on server.");
      }
    }
  }, [cleanup]);

  const finishSuccess = useCallback(
    (jobId: string, downloadUrl: string) => {
      setIsExporting(false);
      setExportProgress(100);
      setActiveJobId(null);
      setExportDone(true);
      setExportError(null);
      cleanup();
      const absolute = buildExportDownloadUrl(downloadUrl);
      setLastDownloadUrl(absolute);
      triggerDownload(absolute, `quickai-short-${jobId}.mp4`);
      toast.success("Export ready — downloading.");

      // Persist record so history page has a working download link.
      const { selectedClipId, suggestions, exportSettings, captionsEnabled } =
        useEditorStore.getState();
      const clip = selectedClipId
        ? suggestions.find((c) => c.id === selectedClipId)
        : suggestions[0];
      if (clip) {
        axios
          .post("/api/exports", {
            clipId: clip.id,
            jobId,
            downloadUrl,
            settings: {
              aspectRatio: exportSettings.aspectRatio,
              quality: exportSettings.quality,
              captionsEnabled,
            },
            output: { filename: `quickai-short-${jobId}.mp4` },
          })
          .catch(() => {
            // Non-critical — history entry is a nice-to-have, not blocking
          });
      }
    },
    [cleanup, triggerDownload],
  );

  const finishFailure = useCallback(
    (message: string) => {
      setIsExporting(false);
      setActiveJobId(null);
      setExportDone(false);
      setExportError(message || "Export failed.");
      cleanup();
      toast.error(message || "Export failed.");
    },
    [cleanup],
  );

  const startPolling = useCallback(
    (jobId: string, intervalMs: number = POLL_INTERVAL_MS) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;
      pollRef.current = setInterval(async () => {
        try {
          const status: ExportStatusResponse = await getExportStatus(
            jobId,
            userId,
          );
          if (status.status === "finished" && status.download_url) {
            finishSuccess(jobId, status.download_url);
            return;
          }
          if (status.status === "failed") {
            finishFailure(status.error ?? "Render failed");
            return;
          }
          if (Date.now() > pollDeadlineRef.current) {
            finishFailure("Export timed out after 10 minutes.");
          }
        } catch (err) {
          if (process.env.NODE_ENV !== "production") console.warn("Export status poll failed:", err);
        }
      }, intervalMs);
    },
    [finishFailure, finishSuccess, userId],
  );

  const subscribeRealtime = useCallback(
    (jobId: string) => {
      const pusher = getSharedPusher();
      if (!pusher) {
        startPolling(jobId, POLL_INTERVAL_MS);
        return;
      }
      const channel = pusher.subscribe(`export-${jobId}`);
      channelRef.current = channel;

      channel.bind("progress", (data: { progress?: number }) => {
        if (typeof data?.progress === "number") {
          setExportProgress(Math.max(0, Math.min(99, Math.round(data.progress))));
        }
      });
      channel.bind("complete", (data: { download_url?: string }) => {
        if (data?.download_url) {
          finishSuccess(jobId, data.download_url);
        } else {
          startPolling(jobId, POLL_INTERVAL_MS);
        }
      });
      channel.bind("error", (data: { error?: string }) => {
        const err = String(data?.error ?? "");
        if (err.toLowerCase() === "cancelled") {
          cleanup();
          setIsExporting(false);
          setExportProgress(0);
          setActiveJobId(null);
          toast.info("Export cancelled.");
          return;
        }
        finishFailure(err || "Render failed");
      });
      channel.bind("cancelled", () => {
        cleanup();
        setIsExporting(false);
        setExportProgress(0);
        setActiveJobId(null);
        toast.info("Export cancelled.");
      });

      // Events primary; slow poll only if Pusher silently drops.
      startPolling(jobId, POLL_INTERVAL_PUSHER_MS);
    },
    [cleanup, finishFailure, finishSuccess, startPolling],
  );

  const exportClip = useCallback(
    async (options: ExportClipOptions = {}) => {
      const {
        sourceFile,
        sourceUrl,
        sourceGcsPath,
        selectedClipId,
        suggestions,
        transcript,
        captionsEnabled,
        canvasElements,
        compiledManifest,
        rebuildRenderManifest,
      } = useEditorStore.getState();

      // Phase 60: ensure we have a fresh manifest
      let manifest = compiledManifest;
      if (!manifest) {
        rebuildRenderManifest();
        manifest = useEditorStore.getState().compiledManifest;
      }

      const clip = selectedClipId
        ? suggestions.find((c) => c.id === selectedClipId)
        : suggestions[0];

      if (!clip) {
        toast.error("Select a clip to export first.");
        return;
      }

      // GCS path takes priority: lazy PUT only on Export final (ingest stays on-device).
      let cloudPath = sourceGcsPath;
      if (!cloudPath && sourceFile) {
        setIsExporting(true);
        setExportProgress(0);
        toast.info(LOOP_COPY.uploadForExport);
        try {
          cloudPath = await uploadLocalFileToGcs(sourceFile, {
            onProgress: (pct) => setExportProgress(Math.min(15, Math.round(pct * 0.15))),
          });
          useEditorStore.getState().setSourceGcsPath(cloudPath);
        } catch (err) {
          setIsExporting(false);
          const msg = err instanceof Error ? err.message : LOOP_COPY.uploadForExportFailed;
          toast.error(LOOP_COPY.uploadForExportFailed);
          if (process.env.NODE_ENV !== "production") {
            console.warn("[export] lazy GCS upload failed:", msg);
          }
          return;
        }
      }

      // Never infer a YouTube id from a local filename (11-char collision).
      const videoId = cloudPath || inferVideoId(sourceUrl, null);
      if (!videoId) {
        toast.error(
          sourceFile ? LOOP_COPY.uploadForExportFailed : LOOP_COPY.shareUnsupported,
        );
        return;
      }

      const enableCaptions = options.captionsEnabled ?? captionsEnabled;
      const srt =
        enableCaptions && transcript?.chunks
          ? generateSRT(transcript.chunks, clip.start, clip.end)
          : "";

      // Normalise canvas elements to fractional coordinates for the backend.
      // Reference canvas: 1080 × 1920 (9:16 at 1080p)
      const CANVAS_W = 1080;
      const CANVAS_H = 1920;
      const canvas_overlays: CanvasOverlay[] = canvasElements.map((el) => ({
        type: el.type === "sticker" ? "sticker" : "text",
        content: el.content,
        x_pct: Math.max(0, Math.min(1, el.x / CANVAS_W)),
        y_pct: Math.max(0, Math.min(1, el.y / CANVAS_H)),
        scale: el.scale,
        rotation: el.rotation,
      }));

      // EP-006 — ensure Studio project exists before bake so first export binds
      let studioProjectId: string | null = null;
      let studioProjectRevision: number | null = null;
      if (process.env.NEXT_PUBLIC_STUDIO_PROJECT_KERNEL === "1") {
        try {
          const { ensureStudioProject } = await import("@/lib/studio/projectKernel");
          studioProjectId = await ensureStudioProject({
            title: "Studio Export",
            active_run_id: useEditorStore.getState().runId,
            proposed_manifest: manifest,
          });
          studioProjectRevision = useEditorStore.getState().studioAckedRevision;
        } catch {
          toast.warning(
            "Studio project bind failed — exporting without Kernel pin.",
          );
        }
      }

      const payload: ExportRequestPayload = {
        videoId,
        start_sec: clip.start,
        end_sec: clip.end,
        user_id: userId,
        runId: useEditorStore.getState().runId,
        aspect_ratio: options.aspectRatio ?? clip.aspectRatio ?? "9:16",
        quality: options.quality ?? "medium",
        captions: {
          enabled: Boolean(enableCaptions),
          srt_content: srt,
          style: null,
        },
        watermark_enabled: Boolean(options.watermarkEnabled),
        reframing: clip.reframing
          ? {
            center: clip.reframing.center,
            scale: clip.reframing.scale,
          }
          : null,
        canvas_overlays,
        audio_boost: useEditorStore.getState().exportSettings.audioBoost,
        playback_speed: useEditorStore.getState().exportSettings.playbackSpeed,
        noise_suppression: useEditorStore.getState().exportSettings.noiseSuppression,
        filter_name: useEditorStore.getState().exportSettings.filter,
        transition_enabled: useEditorStore.getState().exportSettings.transitionEnabled,
        voiceover_enabled: useEditorStore.getState().exportSettings.voiceoverEnabled,
        mute_source_audio: Boolean(
          useEditorStore.getState().dubJob.muteSourceAudio &&
          useEditorStore.getState().dubJob.dubAudioUri,
        ),
        dub_audio_uri: useEditorStore.getState().dubJob.dubAudioUri,
        render_manifest: manifest,
        ...(studioProjectId
          ? {
            project_id: studioProjectId,
            project_revision: studioProjectRevision,
          }
          : {}),
      };

      setIsExporting(true);
      setExportProgress(0);
      toast.info("Render queued on the server…");

      try {
        const { job_id } = await requestExport(payload);
        setActiveJobId(job_id);
        subscribeRealtime(job_id);
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const backendMsg = formatApiDetail(
            err.response?.data?.detail ??
            err.response?.data?.message ??
            err.response?.data?.error,
            err.response?.status ?? 500,
          );
          finishFailure(backendMsg || err.message || "Failed to queue export");
        } else {
          finishFailure(err instanceof Error ? err.message : "Failed to queue export");
        }
      }
    },
    [finishFailure, subscribeRealtime, userId],
  );

  return {
    exportClip,
    cancelExport,
    isExporting,
    exportProgress,
    activeJobId,
    exportDone,
    exportError,
    lastDownloadUrl,
    resetExportState,
    apiBase: API_URL,
  };
}

function inferVideoId(
  sourceUrl: string | null | undefined,
  filename: string | null | undefined,
): string | null {
  // Unwrap proxy URLs (/api/proxy?url=<encoded-youtube-url>) before matching.
  let url = sourceUrl ?? "";
  if (url.includes("/api/proxy")) {
    try {
      const inner = new URL(url).searchParams.get("url");
      if (inner) url = inner;
    } catch {
      // malformed — fall through with original
    }
  }

  if (url) {
    const watch = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (watch?.[1]) return watch[1];
    const short = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|shorts\/))([A-Za-z0-9_-]{6,})/,
    );
    if (short?.[1]) return short[1];
  }
  if (filename) {
    const fromName = filename.match(/([A-Za-z0-9_-]{11})/);
    if (fromName?.[1]) return fromName[1];
  }
  return null;
}
