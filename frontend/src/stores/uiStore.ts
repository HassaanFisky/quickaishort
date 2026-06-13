import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EditorTool = "split" | "trim" | "text" | "fx" | "transitions" | "voiceover";

interface UIState {
  isSidebarCollapsed: boolean;
  activeTool: EditorTool | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  timelineZoom: number;
  toggleSidebar: () => void;
  setActiveTool: (tool: EditorTool | null) => void;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelOpen: (v: boolean) => void;
  setTimelineZoom: (z: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      activeTool: null,
      leftPanelOpen: false,
      rightPanelOpen: false,
      timelineZoom: 1,
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      setActiveTool: (tool) => set((s) => ({ activeTool: s.activeTool === tool ? null : tool })),
      setLeftPanelOpen: (v) => set({ leftPanelOpen: v }),
      setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
      setTimelineZoom: (z) => set({ timelineZoom: Math.max(0.1, Math.min(10, z)) }),
    }),
    { name: "ui-preferences" }
  )
);
