export interface ExportRecord {
  _id: string;
  userId: string;
  projectId: string;
  clipId: string;
  settings: {
    aspectRatio: "9:16" | "1:1";
    quality: "low" | "medium" | "high";
    captionsEnabled?: boolean;
    captionPreset?: string;
    watermarkEnabled?: boolean;
  };
  output?: {
    filename?: string;
    filesize?: number;
    duration?: number;
    resolution?: {
      width?: number;
      height?: number;
    };
  };
  metrics?: {
    processingTimeMs?: number;
    framesProcessed?: number;
  };
  createdAt: string | Date;
}
