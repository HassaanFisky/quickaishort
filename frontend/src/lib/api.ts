import axios, { type InternalAxiosRequestConfig } from "axios";
import type { ClipCandidatePayload, PreflightResult } from "@/types/preflight";
import type {
  ExportEnqueueResponse,
  ExportRequestPayload,
  ExportStatusResponse,
} from "@/types/export";
import type { UserStats } from "@/types/stats";
import type {
  VideoUploadResponse,
  VideoTaskStatus,
  FrameAdjustment,
  PresignedUrlResponse,
} from "@/types/video";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const SESSION_EXPIRED_EVENT = "qai:session-expired";

interface AuthRetryAxiosConfig extends InternalAxiosRequestConfig {
  _authRetried?: boolean;
}

function resolveRequestUrl(config: InternalAxiosRequestConfig): string {
  const url = config.url ?? "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const base = (config.baseURL ?? "").replace(/\/$/, "");
  const path = url.startsWith("/") ? url : `/${url}`;
  return base ? `${base}${path}` : path;
}

function isFastApiRequest(config: InternalAxiosRequestConfig): boolean {
  const full = resolveRequestUrl(config);
  const apiBase = API_URL.replace(/\/$/, "");
  return full.startsWith(apiBase);
}

/** Force-fetch session from server (bypasses client-side getSession cache). */
export async function refreshBackendSession(): Promise<{
  backendToken?: string;
  userId?: string;
} | null> {
  try {
    const res = await fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "include",
    });
    if (!res.ok) return null;
    const session = await res.json();
    return {
      backendToken: session?.backendToken as string | undefined,
      userId: session?.user?.id as string | undefined,
    };
  } catch {
    return null;
  }
}

// Default timeout: 30 s. Long-running inference calls override per-request.
axios.defaults.timeout = 30_000;

// Global response interceptor — network toasts, FastAPI 401 refresh + retry, session modal signal.
if (typeof window !== "undefined") {
  axios.interceptors.response.use(
    (response) => response,
    async (err) => {
      const status: number | undefined = err?.response?.status;
      const config = err?.config as AuthRetryAxiosConfig | undefined;

      if (status === 401 && config && isFastApiRequest(config) && !config._authRetried) {
        config._authRetried = true;
        const refreshed = await refreshBackendSession();
        if (refreshed?.backendToken) {
          config.headers = config.headers || {};
          config.headers["Authorization"] = `Bearer ${refreshed.backendToken}`;
          if (refreshed.userId) {
            config.headers["X-User-Id"] = refreshed.userId;
          }
          return axios(config);
        }
      }

      if (status === 401 && config && isFastApiRequest(config)) {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      }

      if (!status && err?.code === "ERR_NETWORK") {
        const { toast } = await import("sonner");
        toast.error("Connection lost — check your internet and try again.", { id: "network-error" });
      } else if (!status && err?.code === "ECONNABORTED") {
        const { toast } = await import("sonner");
        toast.error("Request timed out — the server took too long to respond.", { id: "timeout-error" });
      }
      return Promise.reject(err);
    },
  );
}

// Attach NextAuth session JWT to every request so FastAPI can verify user identity.
// The session cookie is httpOnly and inaccessible via document.cookie; instead we
// read session.backendToken which auth/options.ts re-encodes server-side and exposes
// on the session object via the session() callback.
if (typeof window !== "undefined") {
  axios.interceptors.request.use(async (config) => {
    try {
      const { getSession } = await import("next-auth/react");
      const session = await getSession();
      if (session?.backendToken) {
        config.headers = config.headers || {};
        config.headers["Authorization"] = `Bearer ${session.backendToken}`;
      }
      if (session?.user?.id) {
        config.headers = config.headers || {};
        config.headers["X-User-Id"] = session.user.id;
      }
    } catch {
      // Silently continue — auth dependency on backend will reject if required
    }
    return config;
  });
}

export async function getVideoInfo(url: string) {
  const { data } = await axios.get(`${API_URL}/api/info`, { params: { url } });
  return data;
}

export function getProxyUrl(url: string) {
  return `${API_URL}/api/proxy?url=${encodeURIComponent(url)}`;
}

export function getProxyVideoUrl(url: string) {
  return `${API_URL}/api/proxy-video?url=${encodeURIComponent(url)}`;
}

// Returns a clean MP3 (audio/mpeg) — always decodable by AudioContext.decodeAudioData()
// Uses yt-dlp + FFmpeg server-side extraction, avoids combined video/mp4 decode failures
export function getAudioUrl(url: string) {
  return `${API_URL}/api/audio?url=${encodeURIComponent(url)}`;
}

/* ── F-1 media proxy tokens ──────────────────────────────────────────────────
 *
 * /api/proxy, /api/proxy-video and /api/audio are consumed by `<video src>` and
 * by a bare fetch() in the audio extractor. Neither can send an Authorization
 * header, so the backend accepts a short-lived HMAC token in the query string
 * instead (see fastapi/services/signing.py::sign_media_url).
 *
 * Backend contract — GET /api/media-token?url=<source> (JWT-authenticated)
 *   -> { token: string, expires: number (unix seconds), user_id: string,
 *        enforced: boolean }
 *
 * The token commits to the EXACT source url + user, so it is cached per source
 * url and can never be reused for a different video.
 *
 * The token is a capability, not a secret we own: it is deliberately kept in
 * memory only. It is never written to localStorage/sessionStorage/cookies and
 * never logged, so it cannot outlive the tab or leak via storage inspection.
 */

export interface MediaTokenResponse {
  token: string;
  expires: number;
  user_id: string;
  enforced: boolean;
}

interface CachedMediaToken {
  token: string;
  expires: number;
  userId: string;
}

// Refresh this many seconds before real expiry so a token cannot lapse
// mid-request (clock skew + request duration).
const MEDIA_TOKEN_SKEW_SECONDS = 120;

// In-memory only. Keyed by the exact source URL the token is bound to.
const mediaTokenCache = new Map<string, CachedMediaToken>();
// De-dupes concurrent mints for the same URL: VideoCanvas and useMediaPipeline
// routinely start together, and without this each would mint its own token.
const mediaTokenInflight = new Map<string, Promise<CachedMediaToken | null>>();

function mediaTokenIsFresh(entry: CachedMediaToken): boolean {
  return entry.expires - MEDIA_TOKEN_SKEW_SECONDS > Math.floor(Date.now() / 1000);
}

/** Testing/sign-out seam — drops all cached media tokens. */
export function clearMediaTokenCache(): void {
  mediaTokenCache.clear();
  mediaTokenInflight.clear();
}

/**
 * Mint (or reuse) a media token for `sourceUrl`.
 *
 * Returns null when the user is unauthenticated or the mint fails. Callers must
 * treat null as "no token" and fall back to the untokenised URL — while
 * MEDIA_PROXY_AUTH_REQUIRED is false the backend still serves those, so this
 * cannot break current playback.
 */
export async function getMediaToken(
  sourceUrl: string,
): Promise<CachedMediaToken | null> {
  const cached = mediaTokenCache.get(sourceUrl);
  if (cached && mediaTokenIsFresh(cached)) return cached;

  const inflight = mediaTokenInflight.get(sourceUrl);
  if (inflight) return inflight;

  const request = (async (): Promise<CachedMediaToken | null> => {
    try {
      // Uses the shared axios instance so the existing request interceptor
      // attaches the NextAuth bearer token and the 401-refresh/retry response
      // interceptor applies. No second auth mechanism is introduced.
      const { data } = await axios.get<MediaTokenResponse>(
        `${API_URL}/api/media-token`,
        { params: { url: sourceUrl } },
      );
      if (!data?.token || !data?.expires) return null;
      const entry: CachedMediaToken = {
        token: data.token,
        expires: data.expires,
        userId: data.user_id,
      };
      mediaTokenCache.set(sourceUrl, entry);
      return entry;
    } catch {
      // Unauthenticated (401/503) or transient failure — caller falls back to
      // the untokenised URL. Never log: the response carries a credential.
      return null;
    } finally {
      mediaTokenInflight.delete(sourceUrl);
    }
  })();

  mediaTokenInflight.set(sourceUrl, request);
  return request;
}

/** Append user_id/token/expires in the exact shape the backend verifies. */
function withMediaToken(base: string, entry: CachedMediaToken | null): string {
  if (!entry) return base;
  const sep = base.includes("?") ? "&" : "?";
  return (
    `${base}${sep}user_id=${encodeURIComponent(entry.userId)}` +
    `&token=${encodeURIComponent(entry.token)}` +
    `&expires=${entry.expires}`
  );
}

/**
 * Authenticated variants of the proxy URL builders.
 *
 * The synchronous builders above are intentionally left unchanged so any caller
 * not yet migrated keeps working while MEDIA_PROXY_AUTH_REQUIRED is false.
 */
export async function getAuthedProxyUrl(url: string): Promise<string> {
  return withMediaToken(getProxyUrl(url), await getMediaToken(url));
}

export async function getAuthedProxyVideoUrl(url: string): Promise<string> {
  return withMediaToken(getProxyVideoUrl(url), await getMediaToken(url));
}

export async function getAuthedAudioUrl(url: string): Promise<string> {
  return withMediaToken(getAudioUrl(url), await getMediaToken(url));
}

export async function runPreflight(
  youtubeUrl: string,
  clipCandidates: ClipCandidatePayload[],
  isPremium: boolean,
  userId: string,
): Promise<PreflightResult> {
  const response = await axios.post<{ preflight_result: PreflightResult }>(
    `${API_URL}/api/preflight`,
    {
      youtube_url: youtubeUrl,
      user_id: userId,
      is_premium: isPremium,
      clip_candidates: clipCandidates,
    },
  );
  return response.data.preflight_result;
}

export async function requestExport(
  payload: ExportRequestPayload,
): Promise<ExportEnqueueResponse> {
  const { data } = await axios.post<ExportEnqueueResponse>(
    `${API_URL}/api/process-video`,
    payload,
  );
  return data;
}

export async function getExportStatus(
  jobId: string,
  userId: string,
): Promise<ExportStatusResponse> {
  const { data } = await axios.get<ExportStatusResponse>(
    `${API_URL}/api/status/${jobId}`,
    { params: { user_id: userId } },
  );
  return data;
}

export async function cancelExportJob(jobId: string): Promise<void> {
  await axios.delete(`${API_URL}/api/render/${jobId}`);
}

export async function getStats(userId: string): Promise<UserStats> {
  const { data } = await axios.get<UserStats>(`${API_URL}/api/stats`, {
    params: { user_id: userId },
  });
  return data;
}

/** AI editor readiness + Gemini circuit + process-local cache stats. */
export async function getAiEditorHealth(): Promise<{
  status: string;
  mock_ai_mode?: boolean;
  gemini_circuit?: {
    blocked?: boolean | null;
    kind?: string | null;
    retry_after_seconds?: number | null;
    state?: string;
  };
  ai_cache?: { hits?: number; misses?: number; hit_rate?: number | null };
  studio_native_tools?: boolean;
}> {
  const { data } = await axios.get(`${API_URL}/api/ai-editor/health`);
  return data;
}

/** EP-004 orchestrator — structured capability plan (MediaGraph chips). */
export async function orchestratorPlan(payload: Record<string, unknown>) {
  const { data } = await axios.post(
    `${API_URL}/api/studio/v1/orchestrator/plan`,
    payload,
  );
  return data;
}

/** EP-004 orchestrator — Kernel execute after local apply. */
export async function orchestratorExecute(payload: Record<string, unknown>) {
  const { data } = await axios.post(
    `${API_URL}/api/studio/v1/orchestrator/execute`,
    payload,
  );
  return data;
}

/** Dub Video enqueue (ADR-014). */
export async function createDubJob(payload: Record<string, unknown>) {
  const { data } = await axios.post(`${API_URL}/api/studio/v1/dub`, payload);
  return data;
}

export async function getDubJob(jobId: string) {
  const { data } = await axios.get(`${API_URL}/api/studio/v1/dub/${jobId}`);
  return data;
}

export async function cancelDubJob(jobId: string) {
  const { data } = await axios.delete(`${API_URL}/api/studio/v1/dub/${jobId}`);
  return data;
}

export function buildExportDownloadUrl(relative: string): string {
  if (!relative) return "";
  if (relative.startsWith("http://") || relative.startsWith("https://")) {
    return relative;
  }
  return `${API_URL}${relative}`;
}

// ---- ADK Studio API ----------------------------------------------------------

export interface StockClip {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  duration: number;
}

export interface ADKGeneratePayload {
  script: string;
  voice_id: string;
  stock_query?: string;
  uploaded_file_ids: string[];
  user_id: string;
  aspect_ratio: "9:16" | "1:1";
  quality: "low" | "medium" | "high";
}

export interface ADKGenerateResponse {
  status: string;
  job_id: string;
  subscribe_channel: string;
  segments_count: number;
  tts_enabled: boolean;
}

export async function uploadADKFootage(
  file: File,
): Promise<{ file_id: string; filename: string; size_bytes: number }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await axios.post(`${API_URL}/api/adk/upload`, form);
  return data;
}

export async function searchStockVideos(q: string): Promise<{ videos: StockClip[] }> {
  const { data } = await axios.get(`${API_URL}/api/adk/stock`, { params: { q } });
  return data;
}

export async function runADKGenerate(payload: ADKGeneratePayload): Promise<ADKGenerateResponse> {
  const { data } = await axios.post<ADKGenerateResponse>(`${API_URL}/api/adk/generate`, payload);
  return data;
}

// ---- Presigned GCS upload ----------------------------------------------------

export async function requestPresignedUploadUrl(
  filename: string,
  contentType: string = "video/mp4",
): Promise<PresignedUrlResponse> {
  const { data } = await axios.post<PresignedUrlResponse>(
    `${API_URL}/api/video/presigned-url`,
    { filename, content_type: contentType },
  );
  return data;
}

export async function uploadFileToGcs(
  presignedUrl: string,
  file: File,
  contentType: string = "video/mp4",
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", presignedUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    const onAbort = () => {
      xhr.abort();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.onload = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`GCS upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
      reject(new Error("GCS upload network error"));
    };
    xhr.send(file);
  });
}

// ---- Video Upload & Processing API -------------------------------------------

export async function uploadVideo(
  file: File,
  processVideo: boolean = false,
  frameAdjustments?: FrameAdjustment,
): Promise<VideoUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("process_video", processVideo ? "true" : "false");

  if (frameAdjustments) {
    form.append("frame_adjustments", JSON.stringify(frameAdjustments));
  }

  const { data } = await axios.post<VideoUploadResponse>(
    `${API_URL}/api/v1/video/upload`,
    form,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      timeout: 60_000, // 60s timeout for large file uploads
    },
  );

  return data;
}

export async function getVideoTaskStatus(taskId: string): Promise<VideoTaskStatus> {
  const { data } = await axios.get<VideoTaskStatus>(
    `${API_URL}/api/v1/video/task/${taskId}`,
    {
      timeout: 10_000,
    },
  );

  return data;
}
