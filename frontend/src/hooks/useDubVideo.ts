"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSession } from "next-auth/react";
import axios from "axios";
import Pusher, { type Channel } from "pusher-js";
import { toast } from "sonner";
import { API_URL } from "@/lib/api";
import { useEditorStore } from "@/stores/editorStore";
import {
  DUB_STAGE_LABELS,
  isDubTerminal,
  type DubMode,
  type DubStage,
  type DubTargetLang,
} from "@/lib/studio/dubFsm";

export interface DubJobResponse {
  job_id: string;
  status: DubStage;
  mode: DubMode;
  target_lang: DubTargetLang;
  voice_id: string;
  progress: number;
  message: string;
  segments: Array<{
    id: string;
    source_text: string;
    translated_text: string;
    start: number;
    end: number;
    timing_adjusted?: boolean;
  }>;
  translated_srt: string;
  dub_audio_uri: string | null;
  preview_audio_url: string | null;
  mute_source_audio: boolean;
  fallback_reason: string | null;
  error: string | null;
  cache_hit: boolean;
}

type DubRealtimePayload = {
  job_id?: string;
  status?: DubStage;
  progress?: number;
  message?: string;
  error?: string | null;
  fallback_reason?: string | null;
  preview_audio_url?: string | null;
  mute_source_audio?: boolean;
  mode?: DubMode;
  target_lang?: DubTargetLang;
};

async function authHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  const token = (session as { backendToken?: string } | null)?.backendToken;
  const userId = session?.user?.id;
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (userId) headers["X-User-Id"] = userId;
  return headers;
}

function applyDubResult(job: DubJobResponse) {
  const store = useEditorStore.getState();
  store.setDubJob({
    jobId: job.job_id,
    status: job.status,
    mode: job.mode,
    targetLang: job.target_lang,
    progress: job.progress,
    message: job.message || DUB_STAGE_LABELS[job.status] || "",
    dubAudioUri: job.dub_audio_uri,
    previewAudioUrl: job.preview_audio_url,
    muteSourceAudio: job.mute_source_audio,
    fallbackReason: job.fallback_reason,
    error: job.error,
  });

  if (
    (job.status === "ready" || job.status === "degraded") &&
    job.segments?.length
  ) {
    const captions = job.segments.map((seg, i) => ({
      id: `dub-cap-${i}`,
      text: seg.translated_text,
      startTime: seg.start,
      endTime: seg.end,
      style: {
        fontSize: 42,
        color: "#ffffff",
        background: "rgba(0,0,0,0.55)",
        position: "bottom" as const,
        bold: true,
      },
    }));
    for (const c of [...store.captions]) {
      store.removeCaption(c.id);
    }
    for (const c of captions) {
      store.addCaption(c);
    }
    store.setCaptionsEnabled(true);
  }
}

function applyRealtimePatch(data: DubRealtimePayload) {
  const store = useEditorStore.getState();
  const prev = store.dubJob;
  if (!data.status && typeof data.progress !== "number") return;
  store.setDubJob({
    ...prev,
    status: data.status ?? prev.status,
    progress:
      typeof data.progress === "number" ? data.progress : prev.progress,
    message: data.message || prev.message,
    error: data.error ?? prev.error,
    fallbackReason: data.fallback_reason ?? prev.fallbackReason,
    previewAudioUrl: data.preview_audio_url ?? prev.previewAudioUrl,
    muteSourceAudio:
      typeof data.mute_source_audio === "boolean"
        ? data.mute_source_audio
        : prev.muteSourceAudio,
    mode: data.mode ?? prev.mode,
    targetLang: data.target_lang ?? prev.targetLang,
  });
}

function toastTerminal(status: DubStage, message?: string, error?: string | null) {
  if (status === "ready") {
    toast.success("Dub Video ready — preview updated.");
  } else if (status === "degraded") {
    toast.warning(message || "Subtitles ready. Voice could not be generated.");
  } else if (status === "failed") {
    toast.error(error || message || "Dub Video failed.");
  }
}

export function useDubVideo() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollErrorsRef = useRef(0);
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const toastedTerminalRef = useRef<string | null>(null);
  const dubJob = useEditorStore((s) => s.dubJob);

  const cleanupRealtime = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unbind_all();
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
  }, []);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    pollErrorsRef.current = 0;
  }, []);

  const stopWatching = useCallback(() => {
    stopPoll();
    cleanupRealtime();
  }, [cleanupRealtime, stopPoll]);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const headers = await authHeaders();
        const { data } = await axios.get<DubJobResponse>(
          `${API_URL}/api/studio/v1/dub/${jobId}`,
          { headers, timeout: 20_000 },
        );
        pollErrorsRef.current = 0;
        applyDubResult(data);
        if (isDubTerminal(data.status)) {
          stopWatching();
          if (toastedTerminalRef.current !== data.job_id + data.status) {
            toastedTerminalRef.current = data.job_id + data.status;
            toastTerminal(data.status, data.message, data.error);
          }
        }
      } catch {
        pollErrorsRef.current += 1;
        if (pollErrorsRef.current === 3) {
          toast.message("Still connecting to Dub status…");
        }
      }
    },
    [stopWatching],
  );

  const startPolling = useCallback(
    (jobId: string) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        void pollJob(jobId);
      }, 4000);
    },
    [pollJob, stopPoll],
  );

  const subscribeRealtime = useCallback(
    (jobId: string) => {
      const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
      cleanupRealtime();
      if (!key || !cluster) {
        startPolling(jobId);
        return;
      }
      if (!pusherRef.current) {
        pusherRef.current = new Pusher(key, { cluster });
      }
      const channel = pusherRef.current.subscribe(`dub-${jobId}`);
      channelRef.current = channel;

      channel.bind("progress", (data: DubRealtimePayload) => {
        applyRealtimePatch(data);
      });
      channel.bind("complete", (data: DubRealtimePayload) => {
        applyRealtimePatch(data);
        // Full segment payload may only exist on GET — refresh once.
        void pollJob(jobId);
      });
      channel.bind("error", (data: DubRealtimePayload) => {
        applyRealtimePatch({
          ...data,
          status: data.status ?? "failed",
        });
        if (toastedTerminalRef.current !== jobId + "failed") {
          toastedTerminalRef.current = jobId + "failed";
          toast.error(data.error || data.message || "Dub Video failed.");
        }
        stopWatching();
      });

      // Belt-and-braces slower poll if events drop.
      startPolling(jobId);
    },
    [cleanupRealtime, pollJob, startPolling, stopWatching],
  );

  const startDub = useCallback(
    async (opts: {
      targetLang: DubTargetLang;
      mode?: DubMode;
      voiceId?: string;
    }) => {
      const store = useEditorStore.getState();
      const chunks = store.transcript?.chunks;
      if (!chunks?.length) {
        toast.error("Transcribe the video first, then try Dub Video.");
        return;
      }

      stopWatching();
      toastedTerminalRef.current = null;
      store.setDubJob({
        jobId: null,
        status: "queued",
        mode: opts.mode ?? "full_dub",
        targetLang: opts.targetLang,
        progress: 0,
        message: "Starting…",
        dubAudioUri: null,
        previewAudioUrl: null,
        muteSourceAudio: (opts.mode ?? "full_dub") !== "captions_only",
        fallbackReason: null,
        error: null,
      });

      try {
        const headers = await authHeaders();
        const { data } = await axios.post<DubJobResponse>(
          `${API_URL}/api/studio/v1/dub`,
          {
            transcript: chunks.map((c) => ({
              text: c.text,
              start: c.start,
              end: c.end,
            })),
            target_lang: opts.targetLang,
            mode: opts.mode ?? "full_dub",
            voice_id: opts.voiceId ?? null,
            project_id: store.studioProjectId,
            source_fingerprint: store.ingestFingerprint,
            run_id: store.runId,
          },
          { headers, timeout: 120_000 },
        );
        applyDubResult(data);
        if (!isDubTerminal(data.status)) {
          subscribeRealtime(data.job_id);
        } else if (data.status === "ready") {
          toast.success(
            data.cache_hit
              ? "Reused cached dub."
              : "Dub Video ready — preview updated.",
          );
        } else if (data.status === "degraded") {
          toast.warning(data.message || "Subtitles ready.");
        }
      } catch (err: unknown) {
        stopWatching();
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.detail || err.message
          : "Failed to start Dub Video";
        store.setDubJob({
          ...store.dubJob,
          status: "failed",
          progress: 100,
          message: typeof msg === "string" ? msg : "Failed to start Dub Video",
          error: typeof msg === "string" ? msg : "start_failed",
        });
        toast.error(typeof msg === "string" ? msg : "Failed to start Dub Video");
      }
    },
    [stopWatching, subscribeRealtime],
  );

  const cancelDub = useCallback(async () => {
    const jobId = useEditorStore.getState().dubJob.jobId;
    if (!jobId) return;
    stopWatching();
    try {
      const headers = await authHeaders();
      const { data } = await axios.delete<DubJobResponse>(
        `${API_URL}/api/studio/v1/dub/${jobId}`,
        { headers },
      );
      applyDubResult(data);
    } catch {
      useEditorStore.getState().setDubJob({
        ...useEditorStore.getState().dubJob,
        status: "cancelled",
        message: "Cancelled",
        progress: 100,
      });
    }
  }, [stopWatching]);

  const clearDub = useCallback(() => {
    stopWatching();
    useEditorStore.getState().clearDubJob();
  }, [stopWatching]);

  useEffect(() => () => stopWatching(), [stopWatching]);

  return {
    dubJob,
    startDub,
    cancelDub,
    clearDub,
    stageLabel: DUB_STAGE_LABELS[dubJob.status] || dubJob.message,
  };
}
