/**
 * GCS PUT only when Export final needs a cloud source.
 * Ingest must not call this — local files stay on-device until then.
 */

import {
  requestPresignedUploadUrl,
  uploadFileToGcs,
} from "@/lib/api";

export async function uploadLocalFileToGcs(
  file: File,
  opts?: {
    onProgress?: (pct: number) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  const { presigned_url, gcs_path } = await requestPresignedUploadUrl(
    file.name,
    file.type || "video/mp4",
  );
  await uploadFileToGcs(
    presigned_url,
    file,
    file.type || "video/mp4",
    opts?.onProgress,
    opts?.signal,
  );
  return gcs_path;
}
