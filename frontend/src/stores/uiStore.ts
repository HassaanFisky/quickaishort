import { create } from "zustand";
import { persist } from "zustand/middleware";

export type EditorTool = "split" | "trim" | "text" | "fx" | "transitions" | "voiceover";

interface UIState {
  isSidebarCollapsed: boolean;
  activeTool: EditorTool | null;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleSidebar: () => void;
  setActiveTool: (tool: EditorTool | null) => void;
  setLeftPanelOpen: (v: boolean) => void;
  setRightPanelOpen: (v: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      activeTool: null,
      leftPanelOpen: false,
      rightPanelOpen: false,
      toggleSidebar: () => set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
      setActiveTool: (tool) => set((s) => ({ activeTool: s.activeTool === tool ? null : tool })),
      setLeftPanelOpen: (v) => set({ leftPanelOpen: v }),
      setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
    }),
    { name: "ui-preferences" }
  )
);
