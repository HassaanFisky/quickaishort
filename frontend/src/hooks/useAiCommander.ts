"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "@/stores/editorStore";
import { useAIPanel } from "@/stores/aiPanelStore";
import {
  callAiEditor,
  AiEditorAbortedError,
  AiEditorAuthError,
  AiEditorBadResponseError,
  AiEditorNetworkError,
  AiEditorPaymentRequiredError,
  AiEditorRateLimitError,
  AiEditorServerError,
  AiEditorTimeoutError,
} from "@/lib/aiEditorClient";
import type { AiEditorRequest } from "@/types/ai-editor";

// ─── Types ────────────────────────────────────────────────────────────────────

type CommanderStatus =
  | "idle"
  | "executing"
  | "applying"
  | "error"
  | "needs_clarification";

export interface UseAiCommander {
  execute: (prompt: string) => Promise<void>;
  cancel: () => void;
  undo: () => void;
  redo: () => void;
  status: CommanderStatus;
  lastError: string | null;
  lastMessage: string | null;
  lastClampedReport: string[];
  lastDroppedReport: string[];
  lastSuggestions: string[];
  canUndo: boolean;
  canRedo: boolean;
  isMockResponse: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAiCommander(): UseAiCommander {
  const [status, setStatus] = useState<CommanderStatus>("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [lastClampedReport, setLastClampedReport] = useState<string[]>([]);
  const [lastDroppedReport, setLastDroppedReport] = useState<string[]>([]);
  const [lastSuggestions, setLastSuggestions] = useState<string[]>([]);
  const [isMockResponse, setIsMockResponse] = useState(false);

  const abortCtrlRef = useRef<AbortController | null>(null);
  const errorClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived from store so hooks stay reactive
  const aiUndoStack = useEditorStore((s) => s.aiUndoStack);
  const aiRedoStack = useEditorStore((s) => s.aiRedoStack);
  const { setExecutionOverlay } = useAIPanel();

  // Cleanup on unmount (E12 — hot reload / unmount aborts in-flight)
  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort();
      if (errorClearRef.current) clearTimeout(errorClearRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    setStatus("idle");
    setExecutionOverlay(false);
  }, [setExecutionOverlay]);

  const execute = useCallback(async (prompt: string) => {
    // R4: empty prompt guard
    const trimmed = prompt.trim();
    if (!trimmed) {
      setLastError("Empty prompt");
      setStatus("error");
      return;
    }

    // Read store state at execution time (R2)
    const storeState = useEditorStore.getState();

    // E1: no video loaded
    if (storeState.duration === 0) {
      setLastError("Load a video first.");
      setStatus("error");
      return;
    }

    // R1: cancel any in-flight request before starting a new one
    abortCtrlRef.current?.abort();
    const ctrl = new AbortController();
    abortCtrlRef.current = ctrl;

    setStatus("executing");
    setLastError(null);
    setLastMessage(null);
    setLastClampedReport([]);
    setLastDroppedReport([]);
    setLastSuggestions([]);
    setIsMockResponse(false);
    setExecutionOverlay(true, "AI is editing your video…");

    // Build request envelope (R2, R3)
    const transcript = storeState.transcript?.chunks?.map((c: { text: string; start: number; end: number }) => ({
      text: c.text,
      start: c.start,
      end: c.end,
    })) ?? [];

    const currentState: AiEditorRequest["current_state"] = {
      videoDuration: storeState.duration,
      currentTime: storeState.currentTime,
      selectedClipId: storeState.selectedClipId,
      elementCount: storeState.elements.length,
      captionCount: storeState.captions.length,
      captionsEnabled: storeState.captionsEnabled,
      aspectRatio: (storeState.exportSettings.aspectRatio as AiEditorRequest["current_state"]["aspectRatio"]) ?? "9:16",
      visualFilter: (storeState.exportSettings.filter as AiEditorRequest["current_state"]["visualFilter"]) ?? "None",
      audioBoost: storeState.exportSettings.audioBoost,
      playbackSpeed: storeState.exportSettings.playbackSpeed,
    };

    const req: AiEditorRequest = {
      prompt: trimmed,
      current_state: currentState,
      transcript,
      video_id: storeState.ytVideoId ?? null,
      run_id: storeState.runId ?? null,
    };

    // R9: per-execution idempotency key
    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);

    try {
      const response = await callAiEditor(req, { signal: ctrl.signal, idempotencyKey });

      // E3: clarification_needed — surface message, don't apply
      if (response.status === "clarification_needed") {
        setStatus("needs_clarification");
        setLastMessage(response.message);
        setLastSuggestions([...response.suggestions]);
        setExecutionOverlay(false);
        return;
      }

      // E2: no_op
      if (response.status === "no_op" || response.actions.length === 0) {
        setStatus("idle");
        setLastMessage(response.message);
        setLastSuggestions([...response.suggestions]);
        setExecutionOverlay(false);
        return;
      }

      setStatus("applying");
      setLastClampedReport([...response.clamped]);
      setLastDroppedReport([...response.dropped]);
      setLastSuggestions([...response.suggestions]);
      setLastMessage(response.message);
      setIsMockResponse(response.used_mock);

      // Apply actions via the store batch method (captures snapshot before applying)
      storeState.applyAiEdits([...response.actions], {
        snapshotLabel: `AI: ${trimmed.slice(0, 40)}`,
        seekToFirstEdit: true,
      });

      // R5: scrub the actual video element for visible playback feedback
      const freshStore = useEditorStore.getState();
      const videoEl = freshStore.videoElementRef?.current;
      if (videoEl && freshStore.currentTime > 0) {
        videoEl.currentTime = freshStore.currentTime;
      }

      setStatus("idle");
      setExecutionOverlay(false);

    } catch (err) {
      // Aborted by cancel() or superseded by a newer execute() — silent reset (R7)
      if (err instanceof AiEditorAbortedError) {
        setStatus("idle");
        setExecutionOverlay(false);
        return;
      }

      // R7: map error subclasses to user-facing messages
      let msg = "The AI editor encountered an unexpected error.";
      if (err instanceof AiEditorPaymentRequiredError) {
        msg = "You're out of credits. Upgrade to Pro to continue editing with AI.";
      } else if (err instanceof AiEditorAuthError) {
        msg = "Your session expired. Please sign in again.";
      } else if (err instanceof AiEditorRateLimitError) {
        msg = "You're going too fast. Wait a few seconds and try again.";
      } else if (err instanceof AiEditorTimeoutError) {
        msg = "The AI editor timed out. Try a shorter prompt.";
      } else if (err instanceof AiEditorNetworkError || err instanceof AiEditorServerError) {
        msg = "The AI editor is temporarily unavailable. Please retry.";
      } else if (err instanceof AiEditorBadResponseError) {
        msg = "The AI editor returned an invalid response. Please retry.";
      }

      setLastError(msg);
      setStatus("error");
      setExecutionOverlay(false);
    }
  }, [setExecutionOverlay]);

  const undo = useCallback(() => {
    // E6: cancel in-flight request first if executing
    if (status === "executing" || status === "applying") {
      cancel();
    }
    const ok = useEditorStore.getState().undoAiEdit();
    if (!ok) {
      setLastError("Nothing to undo.");
      // R8: auto-clear after 1500ms
      if (errorClearRef.current) clearTimeout(errorClearRef.current);
      errorClearRef.current = setTimeout(() => setLastError(null), 1500);
    }
  }, [status, cancel]);

  const redo = useCallback(() => {
    const ok = useEditorStore.getState().redoAiEdit();
    if (!ok) {
      setLastError("Nothing to redo.");
      if (errorClearRef.current) clearTimeout(errorClearRef.current);
      errorClearRef.current = setTimeout(() => setLastError(null), 1500);
    }
  }, []);

  return {
    execute,
    cancel,
    undo,
    redo,
    status,
    lastError,
    lastMessage,
    lastClampedReport,
    lastDroppedReport,
    lastSuggestions,
    canUndo: aiUndoStack.length > 0,
    canRedo: aiRedoStack.length > 0,
    isMockResponse,
  };
}
