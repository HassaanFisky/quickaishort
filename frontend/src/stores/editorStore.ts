import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { Clip, Transcript, CutSegment } from "@/types/pipeline";

export type AgentStatus = "idle" | "working" | "done" | "error";

export interface AgentState {
  status: AgentStatus;
  label: string;
  progress: number;
  message?: string;
  reasoningLogs?: string[];
}

export interface ExportSettings {
  quality: "low" | "medium" | "high";
  aspectRatio: "9:16" | "16:9" | "1:1";
  filter: "None" | "Urban" | "Retro" | "Cinematic";
  audioBoost: number;
  playbackSpeed: number;
  noiseSuppression: number;
  format: "mp4" | "webm";
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  quality: "medium",
  aspectRatio: "9:16",
  filter: "None",
  audioBoost: 85,
  playbackSpeed: 100,
  noiseSuppression: 20,
  format: "mp4",
};

interface EditorState {
  // Source Video
  sourceFile: File | null;
  sourceUrl: string | null;
  duration: number;
  resolution: { width: number; height: number } | null;

  // Processing State
  isProcessing: boolean;
  currentStage: "idle" | "loading" | "transcribing" | "analyzing" | "ready";
  progress: number;

  // ADK Agent Workforce State
  agentStates: {
    ingestion: AgentState;
    transcription: AgentState;
    viralAnalysis: AgentState;
    reframing: AgentState;
  };

  // Playback
  currentTime: number;
  isPlaying: boolean;
  pendingSeek: number | null;

  // Data
  transcript: Transcript | null;
  suggestions: Clip[];
  silenceSegments: CutSegment[];
  audioData: Float32Array | null;
  captionsEnabled: boolean;
  selectedClipId: string | null;

  // Export settings (shared across RightPanel + ExportPanel)
  exportSettings: ExportSettings;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setPendingSeek: (time: number) => void;
  clearPendingSeek: () => void;
  setSourceFile: (file: File, url?: string) => void;
  setSourceUrl: (url: string) => void;
  setProcessing: (
    isProcessing: boolean,
    stage?: EditorState["currentStage"],
  ) => void;
  setAgentState: (
    agent: keyof EditorState["agentStates"],
    update: Partial<AgentState>,
  ) => void;
  setProgress: (progress: number) => void;
  setTranscript: (transcript: Transcript) => void;
  setSuggestions: (suggestions: Clip[]) => void;
  setSilenceSegments: (segments: CutSegment[]) => void;
  setAudioData: (data: Float32Array | null) => void;
  setCaptionsEnabled: (enabled: boolean) => void;
  setSelectedClip: (id: string | null) => void;
  selectClip: (id: string | null) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  setExportSetting: <K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      sourceFile: null,
      sourceUrl: null,
      duration: 0,
      resolution: null,
      isProcessing: false,
      currentStage: "idle",
      progress: 0,

      agentStates: {
        ingestion: { status: "idle", label: "Downloading Video", progress: 0 },
        transcription: { status: "idle", label: "Creating Subtitles", progress: 0 },
        viralAnalysis: { status: "idle", label: "Analyzing Viral Potential", progress: 0 },
        reframing: { status: "idle", label: "Optimizing Format", progress: 0 },
      },

      currentTime: 0,
      isPlaying: false,
      pendingSeek: null,
      transcript: null,
      suggestions: [],
      silenceSegments: [],
      audioData: null,
      captionsEnabled: true,
      selectedClipId: null,
      exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

      setCurrentTime: (time) => set({ currentTime: time }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setDuration: (duration) => set({ duration }),
      setPendingSeek: (time) => set({ pendingSeek: time }),
      clearPendingSeek: () => set({ pendingSeek: null }),

      setSourceFile: (file, url) =>
        set({
          sourceFile: file,
          sourceUrl: url || URL.createObjectURL(file),
          currentStage: "loading",
        }),

      setSourceUrl: (url) =>
        set({
          sourceUrl: url,
          currentStage: "loading",
        }),

      setProcessing: (isProcessing, stage) =>
        set((state) => ({
          isProcessing,
          currentStage: stage || state.currentStage,
        })),

      setAgentState: (agent, update) =>
        set((state) => ({
          agentStates: {
            ...state.agentStates,
            [agent]: { ...state.agentStates[agent], ...update },
          },
        })),

      setProgress: (progress) => set({ progress }),

      setTranscript: (transcript) => set({ transcript }),

      setSuggestions: (suggestions) => set({ suggestions }),
      setSilenceSegments: (segments) => set({ silenceSegments: segments }),
      setAudioData: (data) => set({ audioData: data }),
      setCaptionsEnabled: (enabled) => set({ captionsEnabled: enabled }),
      setSelectedClip: (id) => set({ selectedClipId: id }),
      selectClip: (id) => set({ selectedClipId: id }),

      updateClip: (id, updates) =>
        set((state) => ({
          suggestions: state.suggestions.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),

      setExportSetting: (key, value) =>
        set((state) => ({
          exportSettings: { ...state.exportSettings, [key]: value },
        })),

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          duration: 0,
          resolution: null,
          isProcessing: false,
          currentStage: "idle",
          progress: 0,
          agentStates: {
            ingestion: { status: "idle", label: "Downloading Video", progress: 0 },
            transcription: { status: "idle", label: "Reading Content", progress: 0 },
            viralAnalysis: { status: "idle", label: "Predicting Success", progress: 0 },
            reframing: { status: "idle", label: "Optimizing Format", progress: 0 },
          },
          currentTime: 0,
          isPlaying: false,
          pendingSeek: null,
          transcript: null,
          suggestions: [],
          silenceSegments: [],
          audioData: null,
          captionsEnabled: true,
          selectedClipId: null,
          exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
        }),
    }),
    { name: "EditorStore" },
  ),
);
