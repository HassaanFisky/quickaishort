/**
 * EP-008 — Media Ingest Policy client (backend-authoritative).
 */

import axios from "axios";
import { API_URL } from "@/lib/api";

export interface MediaIngestPolicy {
  version: number;
  extensions: string[];
  mime_types: string[];
  max_bytes: number;
  warn_bytes: number;
  examples_label: string;
}

const CACHE_KEY = "qai_ingest_policy_v1";
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Embedded defaults if API unavailable (server still validates on PUT). */
export const FALLBACK_INGEST_POLICY: MediaIngestPolicy = {
  version: 1,
  extensions: [
    ".mp4",
    ".mov",
    ".mkv",
    ".webm",
    ".avi",
    ".m4v",
    ".mpeg",
    ".mpg",
    ".ts",
    ".mts",
    ".m2ts",
    ".wmv",
    ".flv",
    ".3gp",
    ".ogv",
  ],
  mime_types: [
    "video/mp4",
    "video/quicktime",
    "video/x-matroska",
    "video/webm",
    "video/x-msvideo",
    "video/mpeg",
    "video/mp2t",
    "video/x-ms-wmv",
    "video/x-flv",
    "video/3gpp",
    "video/ogg",
  ],
  max_bytes: 5 * 1024 * 1024 * 1024,
  warn_bytes: 2 * 1024 * 1024 * 1024,
  examples_label: "MP4, MOV, MKV, WebM, AVI, and more",
};

export function validateFileAgainstPolicy(
  file: File,
  policy: MediaIngestPolicy,
): { ok: true } | { ok: false; code: string; message: string } {
  const name = file.name || "video";
  const ext = name.includes(".")
    ? `.${name.split(".").pop()!.toLowerCase()}`
    : "";
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const extOk = ext ? policy.extensions.includes(ext) : false;
  const mimeOk = mime ? policy.mime_types.includes(mime) : false;
  if (!extOk && !mimeOk) {
    return {
      ok: false,
      code: "unsupported_format",
      message: `Unsupported format${ext ? ` (${ext})` : ""}. Try ${policy.examples_label}.`,
    };
  }
  if (file.size > policy.max_bytes) {
    const gb = policy.max_bytes / (1024 ** 3);
    return {
      ok: false,
      code: "too_large",
      message: `File exceeds the ${gb.toFixed(0)} GiB upload limit.`,
    };
  }
  return { ok: true };
}

export function acceptAttrFromPolicy(policy: MediaIngestPolicy): string {
  return [...policy.extensions, "video/*"].join(",");
}

export async function fetchIngestPolicy(): Promise<MediaIngestPolicy> {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; policy: MediaIngestPolicy };
        if (Date.now() - parsed.at < CACHE_TTL_MS && parsed.policy?.extensions) {
          return parsed.policy;
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const { data } = await axios.get<MediaIngestPolicy>(
      `${API_URL}/api/studio/v1/ingest/policy`,
    );
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ at: Date.now(), policy: data }),
      );
    }
    return data;
  } catch {
    return FALLBACK_INGEST_POLICY;
  }
}
