import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { RefObject } from "react";

import { Clip, Transcript, CutSegment } from "@/types/pipeline";

// ─── AI Editor Types ──────────────────────────────────────────────────────────

export interface VideoMetadata {
  id: string;
  url: string;
  title: string;
  duration: number;
  nativeWidth: number;
  nativeHeight: number;
  fps: number;
}

export interface CaptionStyle {
  fontSize: number;
  color: string;
  background: string;
  position: "top" | "middle" | "bottom";
  bold: boolean;
}

export interface Caption {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: CaptionStyle;
}

export interface FrameFilter {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
}

export interface TrimMarker {
  startTime: number;
  endTime: number;
}

export interface EditorAction {
  type:
    | "ADD_CAPTION"
    | "REMOVE_CAPTION"
    | "UPDATE_CAPTION"
    | "TRIM"
    | "ADD_FILTER"
    | "RESET_FILTER"
    | "SEEK"
    | "PLAY"
    | "PAUSE";
  payload: Record<string, unknown>;
}

export interface GeminiResponse {
  actions: EditorAction[];
  message: string;
  suggestions: string[];
}

export interface VideoAnalysis {
  scenes: { time: number; description: string }[];
  transcript: { text: string; startTime: number; endTime: number }[];
  topics: string[];
  suggestedEdits: string[];
}

export interface AIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  actions?: EditorAction[];
}

const DEFAULT_FRAME_FILTERS: FrameFilter = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
};

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontSize: 20,
  color: "#FFFFFF",
  background: "rgba(0,0,0,0.6)",
  position: "bottom",
  bold: false,
};

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
  aspectRatio: "9:16" | "1:1";
  filter: "None" | "Urban" | "Retro" | "Cinematic";
  audioBoost: number;
  playbackSpeed: number;
  noiseSuppression: number;
  format: "mp4" | "webm";
  transitionEnabled: boolean;
  voiceoverEnabled: boolean;
}

export interface CanvasElementStyle {
  className?: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  opacity?: number;
}

export interface CanvasElement {
  id: string;
  type: "text" | "image" | "sticker";
  content: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  style?: CanvasElementStyle;
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
  sourceGcsPath: string | null;

  // YouTube IFrame clip selection (Tier-3/4 flow).
  // Set when user marks a clip range in the IFrame player.
  // Consumed by the backend /api/youtube/clip endpoint.
  ytVideoId: string | null;
  clipStartTime: number;
  clipEndTime: number;
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
  selectClip: (id: string | null) => void;
  setYtVideoId: (id: string | null) => void;
  setClipRange: (startTime: number, endTime: number) => void;
  setSourceGcsPath: (path: string | null) => void;
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

  // ─── AI Editor State ───────────────────────────────────────────────────────
  videoMetadata: VideoMetadata | null;
  captions: Caption[];
  trimMarker: TrimMarker | null;
  frameFilters: FrameFilter;
  aiMessages: AIMessage[];
  isAIThinking: boolean;
  aiPanelOpen: boolean;
  videoAnalysis: VideoAnalysis | null;
  videoElementRef: RefObject<HTMLVideoElement> | null;

  // AI Editor Actions
  setVideoMetadata: (meta: VideoMetadata) => void;
  setTrimMarker: (m: TrimMarker | null) => void;
  setFrameFilter: (patch: Partial<FrameFilter>) => void;
  resetFrameFilters: () => void;
  addCaption: (c: Omit<Caption, "id" | "style"> & { style?: Partial<CaptionStyle> }) => string;
  removeCaption: (id: string) => void;
  updateCaption: (id: string, patch: Partial<Caption>) => void;
  addAIMessage: (msg: Omit<AIMessage, "id" | "timestamp">) => void;
  setAIThinking: (v: boolean) => void;
  setAIPanelOpen: (v: boolean) => void;
  setVideoAnalysis: (a: VideoAnalysis) => void;
  setVideoElementRef: (ref: RefObject<HTMLVideoElement>) => void;
  dispatchAIActions: (actions: EditorAction[]) => void;
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set) => ({
      sourceFile: null,
      sourceUrl: null,
      thumbnailUrl: null,
      sourceGcsPath: null,
      ytVideoId: null,
      clipStartTime: 0,
      clipEndTime: 0,
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

      // AI Editor initial state
      videoMetadata: null,
      captions: [],
      trimMarker: null,
      frameFilters: { ...DEFAULT_FRAME_FILTERS },
      aiMessages: [],
      isAIThinking: false,
      aiPanelOpen: false,
      videoAnalysis: null,
      videoElementRef: null,

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
      selectClip: (id) => set({ selectedClipId: id }),
      setYtVideoId: (id) => set({ ytVideoId: id }),
      setClipRange: (startTime, endTime) => set({ clipStartTime: startTime, clipEndTime: endTime }),
      setSourceGcsPath: (path) => set({ sourceGcsPath: path }),

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
            { 
              ...element, 
              id: typeof crypto !== "undefined" && crypto.randomUUID 
                ? crypto.randomUUID() 
                : Math.random().toString(36).substring(2, 15) 
            },
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

      // ─── AI Editor Actions ─────────────────────────────────────────────────
      setVideoMetadata: (meta) => set({ videoMetadata: meta }),
      setTrimMarker: (m) => set({ trimMarker: m }),

      setFrameFilter: (patch) =>
        set((state) => ({ frameFilters: { ...state.frameFilters, ...patch } })),

      resetFrameFilters: () => set({ frameFilters: { ...DEFAULT_FRAME_FILTERS } }),

      addCaption: (c) => {
        const id = crypto.randomUUID();
        set((state) => {
          const updated = [
            ...state.captions,
            { id, text: c.text, startTime: c.startTime, endTime: c.endTime, style: { ...DEFAULT_CAPTION_STYLE, ...(c.style || {}) } },
          ].sort((a, b) => a.startTime - b.startTime);
          return { captions: updated };
        });
        return id;
      },

      removeCaption: (id) =>
        set((state) => ({ captions: state.captions.filter((c) => c.id !== id) })),

      updateCaption: (id, patch) =>
        set((state) => ({
          captions: state.captions.map((c) => c.id === id ? { ...c, ...patch } : c),
        })),

      addAIMessage: (msg) =>
        set((state) => ({
          aiMessages: [...state.aiMessages, { id: crypto.randomUUID(), timestamp: Date.now(), ...msg }],
        })),

      setAIThinking: (v) => set({ isAIThinking: v }),
      setAIPanelOpen: (v) => set({ aiPanelOpen: v }),
      setVideoAnalysis: (a) => set({ videoAnalysis: a }),
      setVideoElementRef: (ref) => set({ videoElementRef: ref }),

      dispatchAIActions: (actions) => {
        const store = useEditorStore.getState();
        const videoEl = store.videoElementRef?.current;
        actions.forEach((action) => {
          switch (action.type) {
            case "ADD_CAPTION":
              store.addCaption({
                text: action.payload.text as string,
                startTime: action.payload.startTime as number,
                endTime: action.payload.endTime as number,
                style: action.payload.style as Partial<CaptionStyle> | undefined,
              });
              break;
            case "REMOVE_CAPTION":
              store.removeCaption(action.payload.id as string);
              break;
            case "UPDATE_CAPTION":
              store.updateCaption(action.payload.id as string, action.payload.patch as Partial<Caption>);
              break;
            case "TRIM":
              store.setTrimMarker({ startTime: action.payload.start as number, endTime: action.payload.end as number });
              if (videoEl) videoEl.currentTime = action.payload.start as number;
              break;
            case "ADD_FILTER":
              store.setFrameFilter({ [action.payload.filter as string]: action.payload.value as number });
              break;
            case "RESET_FILTER":
              store.resetFrameFilters();
              break;
            case "SEEK":
              if (videoEl) videoEl.currentTime = action.payload.time as number;
              break;
            case "PLAY":
              videoEl?.play();
              break;
            case "PAUSE":
              videoEl?.pause();
              break;
          }
        });
      },

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          thumbnailUrl: null,
          sourceGcsPath: null,
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
          videoMetadata: null,
          captions: [],
          trimMarker: null,
          frameFilters: { ...DEFAULT_FRAME_FILTERS },
          aiMessages: [],
          isAIThinking: false,
          aiPanelOpen: false,
          videoAnalysis: null,
          videoElementRef: null,
        }),
    }),
    { 
      name: "EditorStore",
      // Sanitizer to prevent large Float32Arrays from being serialized to DevTools
      stateSanitizer: (state: any) => 
        state.audioData 
          ? { ...state, audioData: `<<Float32Array(${state.audioData.length})>>` } 
          : state
    },
  ),
);
