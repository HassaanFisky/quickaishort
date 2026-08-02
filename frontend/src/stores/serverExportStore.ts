/**
 * Shared server-export status for chat-primary shell + advanced RightPanel.
 * Single owner: ServerExportHost (useServerExport). Others read/cancel only.
 */

import { create } from "zustand";

type ServerExportState = {
  isExporting: boolean;
  exportProgress: number;
  activeJobId: string | null;
  exportError: string | null;
  exportDone: boolean;
  lastDownloadUrl: string | null;
  cancelExport: (() => Promise<void>) | null;
  resetExportState: (() => void) | null;
  setSnapshot: (patch: {
    isExporting: boolean;
    exportProgress: number;
    activeJobId: string | null;
    exportError: string | null;
    exportDone: boolean;
    lastDownloadUrl: string | null;
  }) => void;
  setControllers: (c: {
    cancelExport: () => Promise<void>;
    resetExportState: () => void;
  }) => void;
};

export const useServerExportStore = create<ServerExportState>((set) => ({
  isExporting: false,
  exportProgress: 0,
  activeJobId: null,
  exportError: null,
  exportDone: false,
  lastDownloadUrl: null,
  cancelExport: null,
  resetExportState: null,
  setSnapshot: (patch) => set(patch),
  setControllers: (c) =>
    set({ cancelExport: c.cancelExport, resetExportState: c.resetExportState }),
}));
