export interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface Transcript {
  chunks: TranscriptChunk[];
  text: string;
  segments?: TranscriptChunk[];
}

/**
 * Viral Score ranges (Locked per CLAUDE.md)
 * 0–40: weak (#6b7280)
 * 41–70: moderate (#f59e0b)
 * 71–89: strong (#a855f7)
 * 90–100: viral (gradient #ec4899→#a855f7 + glow)
 */
export type ViralScore = number;

export interface ViralAnalysis {
  score: ViralScore;
  hookStrength: number;
  retentionPotential: number;
  emotionalTriggers: string[];
  reasoning: string;
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReframingData {
  center: { x: number; y: number };
  scale: number;
  faceDetected: boolean;
  boundingBox?: FaceBox;
}

export interface Clip {
  id: string;
  start: number;
  end: number;
  confidence: number;
  reason: string;
  viralAnalysis?: ViralAnalysis;
  suggestedCaptions?: string[];
  aspectRatio: "9:16" | "1:1";
  captionsEnabled: boolean;
  status: "pending" | "ready" | "exporting" | "exported";
  automation_status?: "Ready" | "Pending";
  reframing?: ReframingData;
}

export type WorkerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "running"
  | "error"
  | "transcribing"
  | "analyzing"
  | "exporting";

export interface WorkerMessagePayload {
  message?: string;
  progress?: number;
  bytesLoaded?: number;
  bytesTotal?: number;
  framesProcessed?: number;
  framesTotal?: number;
  timeElapsedMs?: number;
  etaMs?: number;
  artifact?: Blob | ArrayBuffer;
  transcript?: Transcript;
  suggestions?: Clip[];
  face?: {
    box: FaceBox;
    confidence: number;
  };
  segments?: CutSegment[];
  [key: string]: unknown;
}

export interface WorkerMessage {
  type:
    | "status"
    | "progress"
    | "log"
    | "warning"
    | "error"
    | "complete"
    | "artifact"
    | "face_detected"
    | "silence_detected";
  stage:
    | "init"
    | "download"
    | "load"
    | "process"
    | "encode"
    | "finalize"
    | "detect"
    | "ready"
    | "complete";
  payload: WorkerMessagePayload;
  timestamp: number;
}

export interface CutSegment {
  start: number;
  end: number;
  type: "keep" | "silence";
}

export interface PipelineConfig {
  youtubeUrl: string;
  targetAspectRatio: "9:16" | "1:1";
  enableCaptions: boolean;
  autoReframing: boolean;
}

export interface PipelineResponse {
  videoId: string;
  transcript: Transcript;
  suggestedClips: Clip[];
  metadata: {
    duration: number;
    title: string;
    author: string;
  };
}
