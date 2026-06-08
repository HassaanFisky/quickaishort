import { create } from 'zustand';

export type AIMessage = { role: 'user' | 'assistant'; content: string };

export type VideoContext = {
  id: string;
  title: string;
  transcript: string;
} | null;

type AIPanelState = {
  isOpen: boolean;
  setOpen: (b: boolean) => void;
  videoContext: VideoContext;
  setVideoContext: (ctx: VideoContext) => void;
  messages: AIMessage[];
  addMessage: (m: AIMessage) => void;
  clearMessages: () => void;

  // Pillar-3 additions
  aiPanelMode: 'chat' | 'edit';
  setAiPanelMode: (mode: 'chat' | 'edit') => void;
  executionOverlay: boolean;
  executionOverlayLabel: string | undefined;
  setExecutionOverlay: (active: boolean, label?: string) => void;
};

export const useAIPanel = create<AIPanelState>((set) => ({
  isOpen: false,
  setOpen: (isOpen) => set({ isOpen }),
  videoContext: null,
  setVideoContext: (videoContext) => set({ videoContext }),
  messages: [],
  addMessage: (m) => set((s) => ({ messages: [...s.messages, m] })),
  clearMessages: () => set({ messages: [] }),

  aiPanelMode: 'chat',
  setAiPanelMode: (aiPanelMode) => set({ aiPanelMode }),
  executionOverlay: false,
  executionOverlayLabel: undefined,
  setExecutionOverlay: (active, label) => set({ executionOverlay: active, executionOverlayLabel: label }),
}));
