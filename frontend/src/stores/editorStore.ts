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
    // ─── Caption tools ───────────────────────────────────────────────────────
    | "ADD_CAPTION"         // { text, startTime, endTime, style? }
    | "REMOVE_CAPTION"      // { id }
    | "UPDATE_CAPTION"      // { id, patch }
    // ─── Clip tools ─────────────────────────────────────────────────────────
    | "TRIM"                // { start, end } — sets trimMarker + seeks
    | "SPLIT_CLIP"          // { time } — splits selected clip at time
    | "DELETE_CLIP"         // { id? } — deletes clip by id or selected clip
    | "SELECT_CLIP"         // { id?, index? } — selects a clip
    // ─── Visual tools ───────────────────────────────────────────────────────
    | "ADD_FILTER"          // { filter: "brightness"|"contrast"|"saturation"|"hue"|"blur", value }
    | "RESET_FILTER"        // {} — resets frame filters
    | "SET_VISUAL_FILTER"   // { filter: "None"|"Urban"|"Retro"|"Cinematic" }
    // ─── Audio tools ────────────────────────────────────────────────────────
    | "SET_AUDIO_BOOST"     // { value: 0-200 }
    | "SET_NOISE_REDUCTION" // { value: 0-100 }
    | "SET_PLAYBACK_SPEED"  // { value: 50-200 }
    // ─── Feature toggles ────────────────────────────────────────────────────
    | "TOGGLE_CAPTIONS"     // { enabled: boolean }
    | "TOGGLE_TRANSITIONS"  // { enabled: boolean }
    | "TOGGLE_VOICEOVER"    // { enabled: boolean }
    // ─── Playback ────────────────────────────────────────────────────────────
    | "SEEK"                // { time }
    | "PLAY"                // {}
    | "PAUSE"               // {}
    // ─── Pipeline ────────────────────────────────────────────────────────────
    | "EXPORT_CLIP"         // {} — fires qai:export event
    // ─── Pillar-1 element actions (payload envelope, see applyAiEdits) ───────
    | "ADD_ELEMENT"         // { element: Omit<EditorElement,"id"> }
    | "UPDATE_ELEMENT"      // { id, patch }
    | "REMOVE_ELEMENT"      // { id }
    // ─── Intelligent tool actions (surface suggestions, no direct edit) ──────
    | "DETECT_VIRAL_MOMENTS"  // { moments: AiViralMoment[] }
    | "GENERATE_HOOK_CAPTION" // { captions: string[] }
    | "SUGGEST_STYLE_PRESET"  // { preset, reason, actions }
    | "EXPLAIN_LAST_EDIT";    // { explanation, confidence }
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

// ─── Pillar-1 Strict EditorElement Union ──────────────────────────────────────
// These types are the authoritative canvas element contract for the AI Editor.
// The older CanvasElement / canvasElements API below remains intact for
// CanvasLayer.tsx backward-compatibility.

export type EditorElementType = "TEXT" | "ZOOM" | "TRIM" | "STICKER";

export interface BaseEditorElement {
  id: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface TextElement extends BaseEditorElement {
  type: "TEXT";
  text: string;
  color: string;
  fontWeight?: number | string;
  fontSize?: number;
  className?: string;
}

export interface ZoomElement extends BaseEditorElement {
  type: "ZOOM";
  // Focal point the canvas zooms toward during playback
}

export interface TrimElement extends BaseEditorElement {
  type: "TRIM";
  startTime: number;
  endTime: number;
}

export interface StickerElement extends BaseEditorElement {
  type: "STICKER";
  emoji: string;
}

export type EditorElement = TextElement | ZoomElement | TrimElement | StickerElement;

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

// ─── AI Suggestions (Pillar-3.7 intelligent tools) ───────────────────────────

export interface AiViralMoment {
  timestamp: number;
  hook: string;
  score: number;
}

export interface AiSuggestions {
  viralMoments: AiViralMoment[];
  hookCaptions: string[];
  stylePreset: { preset: string; reason: string } | null;
  lastEditExplanation: { explanation: string; confidence: string } | null;
}

const DEFAULT_AI_SUGGESTIONS: AiSuggestions = {
  viralMoments: [],
  hookCaptions: [],
  stylePreset: null,
  lastEditExplanation: null,
};

// ─── AI Undo Snapshot (Pillar-3) ──────────────────────────────────────────────
// Captures the full AI-mutable surface before any AI edit batch is applied.
export interface AiSnapshot {
  label: string;
  timestamp: number;
  elements: EditorElement[];
  selectedElementId: string | null;
  captions: Caption[];
  trimMarker: TrimMarker | null;
  frameFilters: FrameFilter;
  exportSettings: ExportSettings;
  captionsEnabled: boolean;
  currentTime: number;
}

const _MAX_AI_STACK = 20;

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

// Per-session isolation id generator. Guarded for SSR / older runtimes that
// lack crypto.randomUUID (mirrors the addCanvasElement pattern below).
const genRunId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15);

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

  // Per-session isolation id — minted fresh whenever a new source video loads,
  // so stale clips/analysis from a previous video never bleed into a new run.
  runId: string;

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
  // 120 normalized amplitude values (0.01–1.0) pre-computed by useMediaPipeline
  // immediately after audio extraction using O(1)-per-bar stride sampling.
  // The raw Float32Array is never stored here — peaks are GC-eligible on extraction.
  waveformPeaks: number[] | null;
  captionsEnabled: boolean;
  selectedClipId: string | null;

  // Canvas Elements (Interactivity like PowerPoint/Canva)
  canvasElements: CanvasElement[];

  // ─── Pillar-1 Strict EditorElement API ────────────────────────────────────
  elements: EditorElement[];
  selectedElementId: string | null;
  lastAddedElementId: string | null;
  addElement: (el: Omit<EditorElement, "id">) => void;
  updateElement: (id: string, patch: Partial<EditorElement>) => void;
  removeElement: (id: string) => void;
  selectElement: (id: string | null) => void;

  // Export settings
  exportSettings: ExportSettings;

  // History for undo/redo
  undoStack: Clip[][];
  redoStack: Clip[][];

  // ─── AI-edit undo/redo stack (Pillar-3) ───────────────────────────────────
  aiUndoStack: AiSnapshot[];
  aiRedoStack: AiSnapshot[];

  // ─── AI intelligent tool suggestions (Pillar-3.7) ─────────────────────────
  aiSuggestions: AiSuggestions;

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
  setWaveformPeaks: (peaks: number[] | null) => void;
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
  reset: () => void;
  // Wipe per-video derived data + mint a fresh runId without clearing the source.
  resetForNewVideo: () => void;

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

  // ─── Pillar-3 AI edit batch apply + undo ─────────────────────────────────
  pushAiSnapshot: (label: string) => void;
  undoAiEdit: () => boolean;
  redoAiEdit: () => boolean;
  // Import type is forward-declared; implemented with AiEditorAction from ai-editor.ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyAiEdits: (actions: any[], options?: { snapshotLabel?: string; seekToFirstEdit?: boolean }) => void;
  setAiSuggestions: (patch: Partial<AiSuggestions>) => void;
  clearAiSuggestions: () => void;
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
      runId: genRunId(),
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
      waveformPeaks: null,
      captionsEnabled: true,
      selectedClipId: null,
      canvasElements: [],
      exportSettings: { ...DEFAULT_EXPORT_SETTINGS },

      // Pillar-1 strict element API
      elements: [],
      selectedElementId: null,
      lastAddedElementId: null,

      scriptPrompt: "Write a high-engagement, viral-ready script for this clip.",
      undoStack: [],
      redoStack: [],

      // Pillar-3 AI undo stacks
      aiUndoStack: [],
      aiRedoStack: [],

      // Pillar-3.7 AI suggestions
      aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },

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
          // O6: isolate the new video — drop derived data from any prior run.
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          progress: 0,
        }),

      setSourceUrl: (url) =>
        set({
          sourceUrl: url,
          currentStage: "loading",
          // O6: isolate the new video — drop derived data from any prior run.
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          progress: 0,
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
      setWaveformPeaks: (peaks) => set({ waveformPeaks: peaks }),
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

      // ─── Pillar-1 Strict EditorElement actions ────────────────────────────
      addElement: (el) => {
        const id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : Math.random().toString(36).substring(2, 15);
        const full = { ...el, id } as EditorElement;
        set((state) => ({
          elements: [...state.elements, full],
          lastAddedElementId: id,
          selectedElementId: id,
        }));
      },

      updateElement: (id, patch) =>
        set((state) => ({
          elements: state.elements.map((el) =>
            el.id === id ? ({ ...el, ...patch, type: el.type, id: el.id } as EditorElement) : el,
          ),
        })),

      removeElement: (id) =>
        set((state) => ({
          elements: state.elements.filter((el) => el.id !== id),
          selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
          lastAddedElementId: state.lastAddedElementId === id ? null : state.lastAddedElementId,
        })),

      selectElement: (id) => set({ selectedElementId: id }),

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

            // ── Caption tools ─────────────────────────────────────────────
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

            // ── Clip tools ────────────────────────────────────────────────
            case "TRIM":
              store.setTrimMarker({
                startTime: action.payload.start as number,
                endTime: action.payload.end as number,
              });
              if (videoEl) videoEl.currentTime = action.payload.start as number;
              break;
            case "SPLIT_CLIP": {
              const splitTime = action.payload.time as number;
              if (typeof splitTime === "number") store.splitClipAtTime(splitTime);
              break;
            }
            case "DELETE_CLIP": {
              const targetId = (action.payload.id as string | undefined) || store.selectedClipId;
              if (targetId) store.deleteClip(targetId);
              break;
            }
            case "SELECT_CLIP": {
              if (action.payload.id) {
                store.selectClip(action.payload.id as string);
              } else if (typeof action.payload.index === "number") {
                const clip = store.suggestions[action.payload.index as number];
                if (clip) store.selectClip(clip.id);
              }
              break;
            }

            // ── Visual tools ─────────────────────────────────────────────
            case "ADD_FILTER":
              store.setFrameFilter({
                [action.payload.filter as string]: action.payload.value as number,
              });
              break;
            case "RESET_FILTER":
              store.resetFrameFilters();
              break;
            case "SET_VISUAL_FILTER":
              store.setExportSetting(
                "filter",
                action.payload.filter as ExportSettings["filter"],
              );
              break;

            // ── Audio tools ──────────────────────────────────────────────
            case "SET_AUDIO_BOOST": {
              const v = Math.max(0, Math.min(200, action.payload.value as number));
              store.setExportSetting("audioBoost", v);
              break;
            }
            case "SET_NOISE_REDUCTION": {
              const v = Math.max(0, Math.min(100, action.payload.value as number));
              store.setExportSetting("noiseSuppression", v);
              break;
            }
            case "SET_PLAYBACK_SPEED": {
              const v = Math.max(50, Math.min(200, action.payload.value as number));
              store.setExportSetting("playbackSpeed", v);
              if (videoEl) videoEl.playbackRate = v / 100;
              break;
            }

            // ── Feature toggles ──────────────────────────────────────────
            case "TOGGLE_CAPTIONS":
              store.setCaptionsEnabled(action.payload.enabled as boolean);
              break;
            case "TOGGLE_TRANSITIONS":
              store.setExportSetting("transitionEnabled", action.payload.enabled as boolean);
              break;
            case "TOGGLE_VOICEOVER":
              store.setExportSetting("voiceoverEnabled", action.payload.enabled as boolean);
              break;

            // ── Playback ─────────────────────────────────────────────────
            case "SEEK":
              if (videoEl) videoEl.currentTime = action.payload.time as number;
              break;
            case "PLAY":
              if (videoEl) videoEl.play().catch(() => {});
              store.setIsPlaying(true);
              break;
            case "PAUSE":
              if (videoEl) videoEl.pause();
              store.setIsPlaying(false);
              break;

            // ── Pipeline ─────────────────────────────────────────────────
            case "EXPORT_CLIP":
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("qai:export"));
              }
              break;

            // ── Pillar-1 element actions ──────────────────────────────────
            // Option A: applyAiEdits wraps the wire format in payload before
            // calling dispatchAIActions, so these cases read from payload.
            case "ADD_ELEMENT": {
              const el = action.payload.element as Omit<EditorElement, "id">;
              if (el && typeof el.type === "string") store.addElement(el);
              break;
            }
            case "UPDATE_ELEMENT": {
              const id = action.payload.id as string;
              const patch = action.payload.patch as Partial<EditorElement>;
              if (id && patch) store.updateElement(id, patch);
              break;
            }
            case "REMOVE_ELEMENT": {
              const id = action.payload.id as string;
              if (id) store.removeElement(id);
              break;
            }

            // ── Intelligent tool actions ──────────────────────────────────────
            case "DETECT_VIRAL_MOMENTS": {
              const moments = action.payload.moments as AiViralMoment[];
              store.setAiSuggestions({ viralMoments: moments ?? [] });
              break;
            }
            case "GENERATE_HOOK_CAPTION": {
              const captions = action.payload.captions as string[];
              store.setAiSuggestions({ hookCaptions: captions ?? [] });
              break;
            }
            case "SUGGEST_STYLE_PRESET": {
              const preset = action.payload.preset as string;
              const reason = action.payload.reason as string;
              store.setAiSuggestions({ stylePreset: { preset, reason } });
              // Apply the nested preset actions via the dispatcher
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nestedActions = action.payload.actions as any[];
              if (nestedActions?.length) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const nestedTranslated: EditorAction[] = nestedActions.map((a: any) => {
                  const { type: t, ...rest } = a;
                  return { type: t, payload: rest } as EditorAction;
                });
                store.dispatchAIActions(nestedTranslated);
              }
              break;
            }
            case "EXPLAIN_LAST_EDIT": {
              const explanation = action.payload.explanation as string;
              const confidence = action.payload.confidence as string;
              store.setAiSuggestions({ lastEditExplanation: { explanation, confidence } });
              break;
            }
          }
        });
      },

      // ─── Pillar-3 AI undo / redo ──────────────────────────────────────────
      pushAiSnapshot: (label) => {
        const s = useEditorStore.getState();
        const snapshot: AiSnapshot = {
          label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiUndoStack: [...state.aiUndoStack.slice(-(_MAX_AI_STACK - 1)), snapshot],
          aiRedoStack: [],
        }));
      },

      undoAiEdit: () => {
        const s = useEditorStore.getState();
        if (s.aiUndoStack.length === 0) return false;
        const snapshot = s.aiUndoStack[s.aiUndoStack.length - 1];
        // Capture current for redo
        const current: AiSnapshot = {
          label: snapshot.label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiUndoStack: state.aiUndoStack.slice(0, -1),
          aiRedoStack: [...state.aiRedoStack.slice(-(_MAX_AI_STACK - 1)), current],
          elements: snapshot.elements,
          selectedElementId: snapshot.selectedElementId,
          captions: snapshot.captions,
          trimMarker: snapshot.trimMarker,
          frameFilters: snapshot.frameFilters,
          exportSettings: snapshot.exportSettings,
          captionsEnabled: snapshot.captionsEnabled,
          currentTime: snapshot.currentTime,
        }));
        return true;
      },

      redoAiEdit: () => {
        const s = useEditorStore.getState();
        if (s.aiRedoStack.length === 0) return false;
        const snapshot = s.aiRedoStack[s.aiRedoStack.length - 1];
        const current: AiSnapshot = {
          label: snapshot.label,
          timestamp: Date.now(),
          elements: typeof structuredClone !== "undefined"
            ? structuredClone(s.elements)
            : JSON.parse(JSON.stringify(s.elements)),
          selectedElementId: s.selectedElementId,
          captions: typeof structuredClone !== "undefined"
            ? structuredClone(s.captions)
            : JSON.parse(JSON.stringify(s.captions)),
          trimMarker: s.trimMarker ? { ...s.trimMarker } : null,
          frameFilters: { ...s.frameFilters },
          exportSettings: { ...s.exportSettings },
          captionsEnabled: s.captionsEnabled,
          currentTime: s.currentTime,
        };
        set((state) => ({
          aiRedoStack: state.aiRedoStack.slice(0, -1),
          aiUndoStack: [...state.aiUndoStack.slice(-(_MAX_AI_STACK - 1)), current],
          elements: snapshot.elements,
          selectedElementId: snapshot.selectedElementId,
          captions: snapshot.captions,
          trimMarker: snapshot.trimMarker,
          frameFilters: snapshot.frameFilters,
          exportSettings: snapshot.exportSettings,
          captionsEnabled: snapshot.captionsEnabled,
          currentTime: snapshot.currentTime,
        }));
        return true;
      },

      applyAiEdits: (wireActions, options) => {
        if (!wireActions.length) return;
        const store = useEditorStore.getState();
        store.pushAiSnapshot(options?.snapshotLabel || "AI edit");

        // Translate wire format (flat Pydantic) → dispatcher payload envelope
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const translated: EditorAction[] = wireActions.map((a: any) => {
          const { type, ...rest } = a;
          // For element actions the element/id/patch live directly on rest
          // For existing 20 actions rest IS the payload
          return { type, payload: rest } as EditorAction;
        });

        store.dispatchAIActions(translated);

        // Seek to the first action that has a meaningful time field
        if (options?.seekToFirstEdit !== false) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const first = wireActions.find((a: any) =>
            typeof a.time === "number" ||
            typeof a.start === "number" ||
            typeof a.startTime === "number",
          ) as Record<string, unknown> | undefined;
          if (first) {
            const t = (first.time ?? first.start ?? first.startTime) as number;
            store.setCurrentTime(t);
          }
        }
      },

      resetForNewVideo: () =>
        set({
          runId: genRunId(),
          suggestions: [],
          captions: [],
          transcript: null,
          silenceSegments: [],
          waveformPeaks: null,
          videoAnalysis: null,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          trimMarker: null,
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
          progress: 0,
          isProcessing: false,
          currentStage: "idle",
        }),

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          thumbnailUrl: null,
          sourceGcsPath: null,
          runId: genRunId(),
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
          waveformPeaks: null,
          captionsEnabled: true,
          selectedClipId: null,
          canvasElements: [],
          elements: [],
          selectedElementId: null,
          lastAddedElementId: null,
          exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
          undoStack: [],
          redoStack: [],
          aiUndoStack: [],
          aiRedoStack: [],
          aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS },
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

      setAiSuggestions: (patch) =>
        set((state) => ({ aiSuggestions: { ...state.aiSuggestions, ...patch } })),

      clearAiSuggestions: () => set({ aiSuggestions: { ...DEFAULT_AI_SUGGESTIONS } }),
    }),
    {
      name: "EditorStore",
      enabled: process.env.NODE_ENV !== "production",
    },
  ),
);
