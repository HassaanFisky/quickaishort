import { create } from "zustand";

export interface UploadedFile {
  id: string;
  name: string;
  sizeBytes: number;
  previewUrl?: string;
}

export interface StockClip {
  id: string;
  url: string;
  thumbnail: string;
  title: string;
  duration: number;
}

export type ADKStep = 0 | 1 | 2 | 3;
export type ADKStatus = "idle" | "uploading" | "queued" | "processing" | "done" | "error";

interface ADKState {
  step: ADKStep;
  script: string;
  uploadedFiles: UploadedFile[];
  stockQuery: string;
  selectedStockClips: StockClip[];
  voiceId: string;
  jobId: string | null;
  status: ADKStatus;
  progress: number;
  downloadUrl: string | null;
  errorMessage: string | null;
  ttsEnabled: boolean;
  segmentsCount: number;
  // actions
  setStep: (s: ADKStep) => void;
  setScript: (s: string) => void;
  addFile: (f: UploadedFile) => void;
  removeFile: (id: string) => void;
  setStockQuery: (q: string) => void;
  toggleStockClip: (clip: StockClip) => void;
  setVoiceId: (v: string) => void;
  setJobId: (id: string) => void;
  setStatus: (s: ADKStatus) => void;
  setProgress: (n: number) => void;
  setDownloadUrl: (u: string) => void;
  setError: (m: string) => void;
  setGenerateResult: (r: { job_id: string; tts_enabled: boolean; segments_count: number }) => void;
  reset: () => void;
}

const INITIAL: Pick<
  ADKState,
  | "step"
  | "script"
  | "uploadedFiles"
  | "stockQuery"
  | "selectedStockClips"
  | "voiceId"
  | "jobId"
  | "status"
  | "progress"
  | "downloadUrl"
  | "errorMessage"
  | "ttsEnabled"
  | "segmentsCount"
> = {
  step: 0,
  script: "",
  uploadedFiles: [],
  stockQuery: "",
  selectedStockClips: [],
  voiceId: "en-US-Neural2-D",
  jobId: null,
  status: "idle",
  progress: 0,
  downloadUrl: null,
  errorMessage: null,
  ttsEnabled: false,
  segmentsCount: 0,
};

export const useADKStore = create<ADKState>((set) => ({
  ...INITIAL,
  setStep: (step) => set({ step }),
  setScript: (script) => set({ script }),
  addFile: (f) => set((s) => ({ uploadedFiles: [...s.uploadedFiles, f] })),
  removeFile: (id) =>
    set((s) => ({ uploadedFiles: s.uploadedFiles.filter((f) => f.id !== id) })),
  setStockQuery: (stockQuery) => set({ stockQuery }),
  toggleStockClip: (clip) =>
    set((s) => ({
      selectedStockClips: s.selectedStockClips.find((c) => c.id === clip.id)
        ? s.selectedStockClips.filter((c) => c.id !== clip.id)
        : [...s.selectedStockClips, clip],
    })),
  setVoiceId: (voiceId) => set({ voiceId }),
  setJobId: (jobId) => set({ jobId }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setDownloadUrl: (downloadUrl) => set({ downloadUrl }),
  setError: (errorMessage) => set({ errorMessage, status: "error" }),
  setGenerateResult: ({ job_id, tts_enabled, segments_count }) =>
    set({ jobId: job_id, ttsEnabled: tts_enabled, segmentsCount: segments_count, status: "queued" }),
  reset: () => set(INITIAL),
}));
