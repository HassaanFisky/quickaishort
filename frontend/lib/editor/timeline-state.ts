import { create } from "zustand";

export interface Clip {
  id: string;
  sourceVideoId: string;
  videoUrl: string;
  startTime: number;
  endTime: number;
  trimIn: number;
  trimOut: number;
  track: number;
  volume: number;
  opacity: number;
}

export interface TextLayer {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  animation: "none" | "fadeIn" | "slideUp" | "typewriter";
}

interface HistorySnapshot {
  clips: Clip[];
  textLayers: TextLayer[];
}

interface TimelineState {
  projectId: string | null;
  projectTitle: string;
  duration: number;
  clips: Clip[];
  textLayers: TextLayer[];
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  selectedClipId: string | null;
  selectedTextId: string | null;
  snapToGrid: boolean;
  snapInterval: number;
  history: HistorySnapshot[];
  historyIndex: number;
  isDirty: boolean;

  setProjectId: (id: string) => void;
  setProjectTitle: (title: string) => void;
  setDuration: (duration: number) => void;
  setCurrentTime: (time: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setZoom: (zoom: number) => void;
  setSelectedClipId: (id: string | null) => void;

  addClip: (clip: Omit<Clip, "id">) => void;
  updateClip: (id: string, updates: Partial<Clip>) => void;
  deleteClip: (id: string) => void;
  splitClip: (id: string, time: number) => void;

  addTextLayer: (layer: Omit<TextLayer, "id">) => void;
  updateTextLayer: (id: string, updates: Partial<TextLayer>) => void;
  deleteTextLayer: (id: string) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<void>;
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  projectId: null,
  projectTitle: "Untitled Project",
  duration: 60,
  clips: [],
  textLayers: [],
  currentTime: 0,
  isPlaying: false,
  zoom: 100,
  selectedClipId: null,
  selectedTextId: null,
  snapToGrid: true,
  snapInterval: 0.1,
  history: [],
  historyIndex: -1,
  isDirty: false,

  setProjectId: (id) => set({ projectId: id }),
  setProjectTitle: (title) => set({ projectTitle: title, isDirty: true }),
  setDuration: (duration) => set({ duration }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setZoom: (zoom) => set({ zoom: Math.max(10, Math.min(400, zoom)) }),
  setSelectedClipId: (id) => set({ selectedClipId: id }),

  addClip: (clipData) => {
    const id = `clip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newClip: Clip = { ...clipData, id };
    set((state) => ({
      clips: [...state.clips, newClip],
      isDirty: true,
    }));
    get().pushHistory();
  },

  updateClip: (id, updates) => {
    set((state) => ({
      clips: state.clips.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      isDirty: true,
    }));
  },

  deleteClip: (id) => {
    set((state) => ({
      clips: state.clips.filter((c) => c.id !== id),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
      isDirty: true,
    }));
    get().pushHistory();
  },

  splitClip: (id, splitTime) => {
    const { clips } = get();
    const clip = clips.find((c) => c.id === id);
    if (!clip || splitTime <= clip.startTime || splitTime >= clip.endTime)
      return;

    const offset = splitTime - clip.startTime;

    const firstClip: Clip = {
      ...clip,
      endTime: splitTime,
      trimOut: clip.trimIn + offset,
    };

    const secondClip: Clip = {
      ...clip,
      id: `clip-${Date.now()}-split`,
      startTime: splitTime,
      trimIn: clip.trimIn + offset,
    };

    set((state) => ({
      clips: [...state.clips.filter((c) => c.id !== id), firstClip, secondClip],
      isDirty: true,
    }));
    get().pushHistory();
  },

  addTextLayer: (layerData) => {
    const id = `text-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newLayer: TextLayer = { ...layerData, id };
    set((state) => ({
      textLayers: [...state.textLayers, newLayer],
      isDirty: true,
    }));
    get().pushHistory();
  },

  updateTextLayer: (id, updates) => {
    set((state) => ({
      textLayers: state.textLayers.map((l) =>
        l.id === id ? { ...l, ...updates } : l,
      ),
      isDirty: true,
    }));
  },

  deleteTextLayer: (id) => {
    set((state) => ({
      textLayers: state.textLayers.filter((l) => l.id !== id),
      selectedTextId: state.selectedTextId === id ? null : state.selectedTextId,
      isDirty: true,
    }));
    get().pushHistory();
  },

  pushHistory: () => {
    const { clips, textLayers, history, historyIndex } = get();
    const trimmed = history.slice(0, historyIndex + 1);
    if (trimmed.length >= 50) trimmed.shift();
    trimmed.push({
      clips: clips.map((c) => ({ ...c })),
      textLayers: textLayers.map((l) => ({ ...l })),
    });
    set({ history: trimmed, historyIndex: trimmed.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    set({
      clips: prev.clips.map((c) => ({ ...c })),
      textLayers: prev.textLayers.map((l) => ({ ...l })),
      historyIndex: historyIndex - 1,
      isDirty: true,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    set({
      clips: next.clips.map((c) => ({ ...c })),
      textLayers: next.textLayers.map((l) => ({ ...l })),
      historyIndex: historyIndex + 1,
      isDirty: true,
    });
  },

  save: async () => {
    const { projectId, clips, textLayers, projectTitle, isDirty } = get();
    if (!projectId || !isDirty) return;

    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      await fetch(`${apiUrl}/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: projectTitle,
          timelineData: { clips, textLayers, audioTracks: [] },
        }),
      });

      set({ isDirty: false });
    } catch (err) {
      console.error("Auto-save failed:", err);
    }
  },
}));
