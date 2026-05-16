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
  transitionEnabled: boolean;
  voiceoverEnabled: boolean;
}

export interface CanvasElement {
  id: string;
  type: "text" | "image" | "sticker";
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  style?: any;
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  quality: "medium",
  aspectRatio: "9:16",
  filter: "None",
  audioBoost: 85,
  playbackSpeed: 100,
  noiseSuppression: 20,
  format: "mp4",
  transitionEnabled: false,
  voiceoverEnabled: false,
};

interface EditorState {
  // Source Video
  sourceFile: File | null;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
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

  // Canvas Elements (Interactivity like PowerPoint/Canva)
  canvasElements: CanvasElement[];

  // Export settings (shared across RightPanel + ExportPanel)
  exportSettings: ExportSettings;

  // History for undo/redo
  undoStack: Clip[][];
  redoStack: Clip[][];
  activeTool: "select" | "trim" | "text" | null;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
  setPendingSeek: (time: number) => void;
  clearPendingSeek: () => void;
  setSourceFile: (file: File, url?: string) => void;
  setSourceUrl: (url: string) => void;
  setThumbnailUrl: (url: string | null) => void;
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
  
  // Canvas Actions
  addCanvasElement: (element: Omit<CanvasElement, "id">) => void;
  updateCanvasElement: (id: string, updates: Partial<CanvasElement>) => void;
  removeCanvasElement: (id: string) => void;

  splitClipAtTime: (time: number) => void;
  deleteClip: (id: string) => void;
  undo: () => void;
  redo: () => void;
  scriptPrompt: string;
  setScriptPrompt: (prompt: string) => void;
  setActiveTool: (tool: EditorState["activeTool"]) => void;
  reset: () => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      sourceFile: null,
      sourceUrl: null,
      thumbnailUrl: null,
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
      canvasElements: [],
      exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

      scriptPrompt: "Write a high-engagement, viral-ready script for this clip.",
      undoStack: [],
      redoStack: [],
      activeTool: "select",

      setScriptPrompt: (prompt) => set({ scriptPrompt: prompt }),

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

      setThumbnailUrl: (url) => set({ thumbnailUrl: url }),

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

      splitClipAtTime: (time) =>
        set((state) => {
          const { selectedClipId, suggestions } = state;
          const clip = selectedClipId
            ? suggestions.find((c) => c.id === selectedClipId)
            : suggestions[0];

          // Guard: time must be inside the clip bounds with at least 1s on each side
          if (!clip || time <= clip.start + 1 || time >= clip.end - 1) return {};

          const idx = suggestions.findIndex((c) => c.id === clip.id);
          const idA = `${clip.id}-a`;
          const idB = `${clip.id}-b`;

          const clipA: typeof clip = {
            ...clip,
            id: idA,
            end: time,
          };
          const clipB: typeof clip = {
            ...clip,
            id: idB,
            start: time,
          };

          const next = [...suggestions];
          next.splice(idx, 1, clipA, clipB);

          return {
            undoStack: [...state.undoStack.slice(-49), [...suggestions]],
            redoStack: [],
            suggestions: next,
            selectedClipId: idA,
          };
        }),

      deleteClip: (id) =>
        set((state) => ({
          undoStack: [...state.undoStack.slice(-49), [...state.suggestions]],
          redoStack: [],
          suggestions: state.suggestions.filter((c) => c.id !== id),
          selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
        })),

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return {};
          const prev = state.undoStack[state.undoStack.length - 1];
          return {
            undoStack: state.undoStack.slice(0, -1),
            redoStack: [...state.redoStack, [...state.suggestions]],
            suggestions: prev,
          };
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return {};
          const next = state.redoStack[state.redoStack.length - 1];
          return {
            redoStack: state.redoStack.slice(0, -1),
            undoStack: [...state.undoStack, [...state.suggestions]],
            suggestions: next,
          };
        }),

      setActiveTool: (tool) => set({ activeTool: tool }),

      setExportSetting: (key, value) =>
        set((state) => ({
          exportSettings: { ...state.exportSettings, [key]: value },
        })),

      addCanvasElement: (element) =>
        set((state) => ({
          canvasElements: [
            ...state.canvasElements,
            { ...element, id: Math.random().toString(36).substr(2, 9) },
          ],
        })),

      updateCanvasElement: (id, updates) =>
        set((state) => ({
          canvasElements: state.canvasElements.map((el) =>
            el.id === id ? { ...el, ...updates } : el,
          ),
        })),

      removeCanvasElement: (id) =>
        set((state) => ({
          canvasElements: state.canvasElements.filter((el) => el.id !== id),
        })),

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          thumbnailUrl: null,
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
          canvasElements: [],
          exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
        }),
    }),
    { name: "EditorStore" },
  ),
);
