import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { Clip, Transcript, CutSegment } from "@/types/pipeline";

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

  // Playback
  currentTime: number;
  isPlaying: boolean;

  // Data
  transcript: Transcript | null;
  suggestions: Clip[];
  silenceSegments: CutSegment[];
  audioData: Float32Array | null;
  captionsEnabled: boolean;
  selectedClipId: string | null;

  // Actions
  setCurrentTime: (time: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSourceFile: (file: File, url?: string) => void;
  setSourceUrl: (url: string) => void;
  setProcessing: (
    isProcessing: boolean,
    stage?: EditorState["currentStage"],
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
      currentTime: 0,
      isPlaying: false,
      transcript: null,
      suggestions: [],
      silenceSegments: [],
      audioData: null,
      captionsEnabled: true,
      selectedClipId: null,

      setCurrentTime: (time) => set({ currentTime: time }),
      setIsPlaying: (playing) => set({ isPlaying: playing }),

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

      reset: () =>
        set({
          sourceFile: null,
          sourceUrl: null,
          duration: 0,
          resolution: null,
          isProcessing: false,
          currentStage: "idle",
          progress: 0,
          currentTime: 0,
          isPlaying: false,
          transcript: null,
          suggestions: [],
          silenceSegments: [],
          audioData: null,
          captionsEnabled: true,
          selectedClipId: null,
        }),
    }),
    { name: "EditorStore" },
  ),
);
