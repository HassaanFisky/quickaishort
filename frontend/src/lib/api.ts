import axios from "axios";
import type { ClipCandidatePayload, PreflightResult } from "@/types/preflight";
import type {
  ExportEnqueueResponse,
  ExportRequestPayload,
  ExportStatusResponse,
} from "@/types/export";
import type { UserStats } from "@/types/stats";

// .trim() strips any accidental \r\n that Vercel CLI may append to env var values
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "").trim();
if (!API_URL && typeof window !== "undefined") {
  console.warn("NEXT_PUBLIC_API_URL is not defined. API calls may fail.");
}

export async function getVideoInfo(url: string) {
  const { data } = await axios.get(`${API_URL}/api/info`, { params: { url } });
  return data;
}

export function getProxyUrl(url: string) {
  return `${API_URL}/api/proxy?url=${encodeURIComponent(url)}`;
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
