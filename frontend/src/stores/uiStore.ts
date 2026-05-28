import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      isSidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ isSidebarCollapsed: !s.isSidebarCollapsed })),
    }),
    { name: "ui-preferences" }
  )
);
