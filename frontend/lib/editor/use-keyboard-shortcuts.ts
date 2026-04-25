"use client";

import { useEffect } from "react";
import { useTimelineStore } from "./timeline-state";

export function useKeyboardShortcuts() {
  const {
    undo,
    redo,
    deleteClip,
    splitClip,
    selectedClipId,
    currentTime,
    setIsPlaying,
    isPlaying,
    zoom,
    setZoom,
  } = useTimelineStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      if (ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (
        ctrlKey &&
        (e.key === "y" || (isMac && e.shiftKey && e.key === "Z"))
      ) {
        e.preventDefault();
        redo();
      } else if (e.key === " ") {
        e.preventDefault();
        setIsPlaying(!isPlaying);
      } else if (e.key === "s" && !ctrlKey) {
        if (selectedClipId) {
          e.preventDefault();
          splitClip(selectedClipId, currentTime);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedClipId) {
          e.preventDefault();
          deleteClip(selectedClipId);
        }
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setZoom(Math.min(400, zoom + 20));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom(Math.max(10, zoom - 20));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    undo,
    redo,
    deleteClip,
    splitClip,
    selectedClipId,
    currentTime,
    isPlaying,
    setIsPlaying,
    zoom,
    setZoom,
  ]);
}
