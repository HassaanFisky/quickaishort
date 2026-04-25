"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import { generateSRT } from "@/lib/utils/srtGenerator";

type ExportQuality = "low" | "medium" | "high";
type ExportAspect = "9:16" | "1:1";

interface ExportOptions {
  quality?: ExportQuality;
  aspectRatio?: ExportAspect;
  captionsEnabled?: boolean;
}

export function useExport() {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const getOrCreateWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/ffmpeg.worker.ts", import.meta.url),
      );
    }
    return workerRef.current;
  }, []);

  const exportClip = useCallback(
    async (options: ExportOptions = {}) => {
      const {
        sourceFile,
        sourceUrl,
        selectedClipId,
        suggestions,
        transcript,
        captionsEnabled,
      } = useEditorStore.getState();

      const clip = selectedClipId
        ? suggestions.find((c) => c.id === selectedClipId)
        : suggestions[0];

      if (!clip) {
        toast.error("Select a clip to export first.");
        return;
      }

      const sourceBlob =
        sourceFile ??
        (sourceUrl
          ? await fetch(sourceUrl)
              .then((r) => r.blob())
              .catch(() => null)
          : null);

      if (!sourceBlob) {
        toast.error("No video source found.");
        return;
      }

      const quality = options.quality ?? "medium";
      const aspectRatio = options.aspectRatio ?? "9:16";
      const enableCaptions = options.captionsEnabled ?? captionsEnabled;

      const srtContent =
        enableCaptions && transcript?.chunks
          ? generateSRT(transcript.chunks, clip.start, clip.end)
          : "";

      const worker = getOrCreateWorker();
      setIsExporting(true);
      setExportProgress(0);
      toast.info("Starting export with FFmpeg.wasm…");

      return new Promise<void>((resolve, reject) => {
        worker.onmessage = (e) => {
          const { type, payload } = e.data;

          if (type === "progress" && payload.progress !== undefined) {
            setExportProgress(payload.progress as number);
          }

          if (type === "artifact" && payload.artifact) {
            const blob = payload.artifact as Blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `quickai-short-${clip.id}-${Date.now()}.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setIsExporting(false);
            setExportProgress(100);
            toast.success("Export complete! Downloading…");
            resolve();
          }

          if (type === "error") {
            const msg = (payload.message as string) || "Export failed";
            setIsExporting(false);
            toast.error(msg);
            reject(new Error(msg));
          }
        };

        worker.onerror = (err) => {
          setIsExporting(false);
          const msg = err.message || "FFmpeg worker crashed";
          toast.error(msg);
          reject(new Error(msg));
        };

        worker.postMessage({
          type: "export",
          payload: {
            inputBlob: sourceBlob,
            startTime: clip.start,
            endTime: clip.end,
            aspectRatio,
            quality,
            reframing: clip.reframing,
            captions: enableCaptions
              ? {
                  enabled: true,
                  srtContent,
                  style:
                    "Fontname=Inter,FontSize=14,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=30",
                }
              : undefined,
          },
        });
      });
    },
    [getOrCreateWorker],
  );

  const terminateExportWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { exportClip, isExporting, exportProgress, terminateExportWorker };
}
