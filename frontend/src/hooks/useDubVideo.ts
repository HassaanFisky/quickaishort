"use client";

import { useCallback, useEffect, useRef } from "react";
import { getSession } from "next-auth/react";
import axios from "axios";
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
    // Replace captions with translated set
    for (const c of [...store.captions]) {
      store.removeCaption(c.id);
    }
    for (const c of captions) {
      store.addCaption(c);
    }
    store.setCaptionsEnabled(true);
  }
}

export function useDubVideo() {
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dubJob = useEditorStore((s) => s.dubJob);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const headers = await authHeaders();
        const { data } = await axios.get<DubJobResponse>(
          `${API_URL}/api/studio/v1/dub/${jobId}`,
          { headers, timeout: 20_000 },
        );
        applyDubResult(data);
        if (isDubTerminal(data.status)) {
          stopPoll();
          if (data.status === "ready") {
            toast.success("Dub Video ready — preview updated.");
          } else if (data.status === "degraded") {
            toast.warning(
              data.message || "Subtitles ready. Voice could not be generated.",
            );
          } else if (data.status === "failed") {
            toast.error(data.error || data.message || "Dub Video failed.");
          }
        }
      } catch {
        // Keep polling through transient errors
      }
    },
    [stopPoll],
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

      stopPoll();
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
          pollRef.current = setInterval(() => {
            void pollJob(data.job_id);
          }, 2000);
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
        stopPoll();
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
    [pollJob, stopPoll],
  );

  const cancelDub = useCallback(async () => {
    const jobId = useEditorStore.getState().dubJob.jobId;
    if (!jobId) return;
    stopPoll();
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
  }, [stopPoll]);

  const clearDub = useCallback(() => {
    stopPoll();
    useEditorStore.getState().clearDubJob();
  }, [stopPoll]);

  useEffect(() => () => stopPoll(), [stopPoll]);

  return {
    dubJob,
    startDub,
    cancelDub,
    clearDub,
    stageLabel: DUB_STAGE_LABELS[dubJob.status] || dubJob.message,
  };
}
