"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Pusher, { type Channel } from "pusher-js";
import { toast } from "sonner";

import { useEditorStore } from "@/stores/editorStore";
import { generateSRT } from "@/lib/utils/srtGenerator";
import {
  API_URL,
  buildExportDownloadUrl,
  getExportStatus,
  requestExport,
} from "@/lib/api";
import type {
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

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function useServerExport({ userId }: UseServerExportArgs) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const pusherRef = useRef<Pusher | null>(null);
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

  const finishSuccess = useCallback(
    (jobId: string, downloadUrl: string) => {
      setIsExporting(false);
      setExportProgress(100);
      setActiveJobId(null);
      cleanup();
      const absolute = buildExportDownloadUrl(downloadUrl);
      triggerDownload(absolute, `quickai-short-${jobId}.mp4`);
      toast.success("Export ready — downloading.");
    },
    [cleanup, triggerDownload],
  );

  const finishFailure = useCallback(
    (message: string) => {
      setIsExporting(false);
      setActiveJobId(null);
      cleanup();
      toast.error(message || "Export failed.");
    },
    [cleanup],
  );

  const startPolling = useCallback(
    (jobId: string) => {
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
          console.warn("Export status poll failed:", err);
        }
      }, POLL_INTERVAL_MS);
    },
    [finishFailure, finishSuccess, userId],
  );

  const subscribeRealtime = useCallback(
    (jobId: string) => {
      const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
      if (!key || !cluster) {
        startPolling(jobId);
        return;
      }
      if (!pusherRef.current) {
        pusherRef.current = new Pusher(key, { cluster });
      }
      const channel = pusherRef.current.subscribe(`export-${jobId}`);
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
          startPolling(jobId);
        }
      });
      channel.bind("error", (data: { error?: string }) => {
        finishFailure(data?.error ?? "Render failed");
      });

      // Belt-and-braces: also poll periodically. If Pusher delivers first, the
      // poll will see "finished" and short-circuit; if Pusher silently drops,
      // the poll catches it.
      startPolling(jobId);
    },
    [finishFailure, finishSuccess, startPolling],
  );

  const exportClip = useCallback(
    async (options: ExportClipOptions = {}) => {
      const {
        sourceFile,
        sourceUrl,
        selectedClipId,
        suggestions,
        transcript,
        captionsEnabled,
      } = useEditorStore.getState();

      const clip = selectedClipId
        ? suggestions.find((c) => c.id === selectedClipId)
        : suggestions[0];

      if (!clip) {
        toast.error("Select a clip to export first.");
        return;
      }

      const videoId = inferVideoId(sourceUrl, sourceFile?.name);
      if (!videoId) {
        toast.error(
          "Server export currently requires a YouTube source URL. Local file export is coming.",
        );
        return;
      }

      const enableCaptions = options.captionsEnabled ?? captionsEnabled;
      const srt =
        enableCaptions && transcript?.chunks
          ? generateSRT(transcript.chunks, clip.start, clip.end)
          : "";

      const payload: ExportRequestPayload = {
        videoId,
        start_sec: clip.start,
        end_sec: clip.end,
        user_id: userId,
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
      };

      setIsExporting(true);
      setExportProgress(0);
      toast.info("Render queued on the server…");

      try {
        const { job_id } = await requestExport(payload);
        setActiveJobId(job_id);
        subscribeRealtime(job_id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to queue export";
        finishFailure(msg);
      }
    },
    [finishFailure, subscribeRealtime, userId],
  );

  return {
    exportClip,
    isExporting,
    exportProgress,
    activeJobId,
    apiBase: API_URL,
  };
}

function inferVideoId(
  sourceUrl: string | null | undefined,
  filename: string | null | undefined,
): string | null {
  if (sourceUrl) {
    const watch = sourceUrl.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    if (watch?.[1]) return watch[1];
    const short = sourceUrl.match(
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
