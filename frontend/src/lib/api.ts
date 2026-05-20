import axios from "axios";
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
} from "@/types/video";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Default timeout: 30 s. Long-running inference calls override per-request.
axios.defaults.timeout = 30_000;

// Attach NextAuth session JWT to every request so FastAPI can verify user identity
if (typeof window !== "undefined") {
  axios.interceptors.request.use(async (config) => {
    try {
      // next-auth/react getSession reads the session cookie
      const { getSession } = await import("next-auth/react");
      const session = await getSession();
      if (session) {
        // The NextAuth session token is in the cookie; we use the user id as X-User-Id
        // and send the raw session cookie value as the Bearer token.
        // next-auth encodes the JWT in the __Secure-next-auth.session-token cookie.
        const cookieName =
          window.location.protocol === "https:"
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token";
        const cookies = document.cookie.split(";");
        const sessionCookie = cookies
          .map((c) => c.trim())
          .find((c) => c.startsWith(`${cookieName}=`));
        // Use slice instead of split("=") to correctly handle base64url tokens with "=" padding
        const token = sessionCookie ? sessionCookie.slice(cookieName.length + 1) : "";
        if (token) {
          config.headers = config.headers || {};
          config.headers["Authorization"] = `Bearer ${token}`;
        }
        if (session.user?.id) {
          config.headers = config.headers || {};
          config.headers["X-User-Id"] = session.user.id;
        }
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

export async function getStats(userId: string): Promise<UserStats> {
  const { data } = await axios.get<UserStats>(`${API_URL}/api/stats`, {
    params: { user_id: userId },
  });
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
