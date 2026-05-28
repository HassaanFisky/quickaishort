/**Video upload and processing types for the API integration. */

export interface FrameAdjustment {
  brightness: number; // 0.5-2.0
  contrast: number; // 0.5-2.0
  saturation: number; // 0.5-2.0
  hue: number; // -180 to 180
  blur: number; // 0-50
}

export interface VideoUploadResponse {
  request_id: string;
  file_id: string;
  filename: string;
  task_id: string | null;
  message: string;
}

export interface VideoTaskResult {
  status: "success" | "failed";
  input_file_id: string;
  output_file_id?: string;
  duration: number;
  output_size: number;
}

export interface VideoTaskStatus {
  task_id: string;
  state: "pending" | "processing" | "success" | "failed";
  result?: VideoTaskResult;
  error?: string;
  current?: number;
  total?: number;
}

export interface PresignedUrlResponse {
  presigned_url: string;
  gcs_path: string;
  job_id: string;
  expires_in_seconds: number;
}

export interface VideoUploadState {
  file: File | null;
  fileName: string;
  fileSize: number;
  processVideo: boolean;
  frameAdjustments: FrameAdjustment;
  uploadProgress: number; // 0-100
  uploadedFileId: string | null;
  taskId: string | null;
  taskState: "idle" | "uploading" | "pending" | "processing" | "success" | "failed";
  taskResult: VideoTaskResult | null;
  errorMessage: string | null;
  successMessage: string | null;
}
