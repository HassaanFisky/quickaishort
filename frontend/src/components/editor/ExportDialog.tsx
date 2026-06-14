"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Server, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEditorStore } from "@/stores/editorStore";
import {
  WebCodecsExporter,
  EXPORT_PRESETS,
  MAX_CLIP_SECONDS,
  type ExportPreset,
  type ExportProgress,
} from "@/lib/export/webCodecsExporter";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const videoElementRef = useEditorStore((s) => s.videoElementRef);
  const duration = useEditorStore((s) => s.duration);
  const dispatchAIActions = useEditorStore((s) => s.dispatchAIActions);

  const [clientSupported, setClientSupported] = useState<boolean | null>(null);
  const [flagEnabled, setFlagEnabled] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const exporterRef = useRef<WebCodecsExporter | null>(null);

  const canUseClientExport =
    clientSupported && flagEnabled && duration > 0 && duration <= MAX_CLIP_SECONDS;

  useEffect(() => {
    if (!open) return;
    WebCodecsExporter.isSupported().then(setClientSupported);
    WebCodecsExporter.isFlagEnabled().then(setFlagEnabled);
  }, [open]);

  const handleServerExport = useCallback(() => {
    dispatchAIActions([{ type: "EXPORT_CLIP", payload: {} }]);
    toast.info("Server render queued — you'll get a download link when ready.");
    onClose();
  }, [dispatchAIActions, onClose]);

  const handleClientExport = useCallback(async () => {
    const video = videoElementRef?.current;
    if (!video) { toast.error("No video loaded."); return; }

    setExporting(true);
    setProgress({ encoded: 0, total: 0, cancelled: false });

    const exporter = new WebCodecsExporter();
    exporterRef.current = exporter;

    try {
      await exporter.init(selectedPreset);

      const fps = selectedPreset.frameRate;
      const totalFrames = Math.ceil(duration * fps);
      setProgress({ encoded: 0, total: totalFrames, cancelled: false });

      const wasPlaying = !video.paused;
      video.pause();
      const originalTime = video.currentTime;

      for (let f = 0; f < totalFrames; f++) {
        if (exporter["cancelled"]) break;
        const timeSec = f / fps;
        video.currentTime = timeSec;
        await new Promise<void>((res) => {
          video.addEventListener("seeked", () => res(), { once: true });
        });
        await exporter.encodeFrameAt(video, f * (1_000_000 / fps), fps);
        setProgress({ encoded: f + 1, total: totalFrames, cancelled: false });
      }

      video.currentTime = originalTime;
      if (wasPlaying) video.play().catch(() => {});

      if (!exporter["cancelled"]) {
        const blob = await exporter.finalize();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "export.mp4";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export complete!");
        onClose();
      }
    } catch (err) {
      if (process.env.NODE_ENV !== "production") console.error("[ExportDialog]", err);
      toast.error("Export failed — try Server render instead.");
    } finally {
      exporter.dispose();
      exporterRef.current = null;
      setExporting(false);
      setProgress(null);
    }
  }, [videoElementRef, duration, selectedPreset, onClose]);

  const handleCancel = useCallback(() => {
    exporterRef.current?.cancel();
    setExporting(false);
    setProgress(null);
    toast.info("Export cancelled.");
  }, []);

  const percent =
    progress && progress.total > 0
      ? Math.round((progress.encoded / progress.total) * 100)
      : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-[min(480px,94vw)] rounded-2xl border border-border bg-surface p-6 shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-bold text-foreground">Export</h2>
              <button onClick={onClose} className="text-fg-muted hover:text-foreground transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Presets */}
            <div className="mb-4">
              <p className="text-xs text-fg-muted mb-2 font-medium">Resolution</p>
              <div className="grid grid-cols-3 gap-2">
                {EXPORT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setSelectedPreset(p)}
                    disabled={exporting}
                    className={cn(
                      "text-[11px] font-semibold px-2 py-2 rounded-lg border transition-colors",
                      selectedPreset.label === p.label
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-card border-border text-fg-muted hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Progress bar */}
            {exporting && progress && (
              <div className="mb-4">
                <div className="flex items-center justify-between text-xs text-fg-muted mb-1.5">
                  <span>Encoding…</span>
                  <span>{percent}%</span>
                </div>
                <div className="h-1.5 bg-card rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
            )}

            {/* Client export notice */}
            {canUseClientExport && !exporting && (
              <p className="text-[11px] text-fg-muted mb-4 flex items-center gap-1.5">
                <Zap size={11} className="text-primary shrink-0" />
                Hardware-accelerated local export — stays on your device, instant download.
              </p>
            )}
            {!canUseClientExport && !exporting && (
              <p className="text-[11px] text-fg-muted mb-4">
                {duration > MAX_CLIP_SECONDS
                  ? `Clip is ${Math.round(duration)}s (> ${MAX_CLIP_SECONDS}s) — server render required.`
                  : !clientSupported
                  ? "WebCodecs not available in this browser — server render required."
                  : "Enable the webcodecs_export_enabled flag for local export."}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {canUseClientExport && !exporting && (
                <button
                  onClick={handleClientExport}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  <Download size={13} />
                  Export locally
                </button>
              )}
              {exporting ? (
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border border-border text-xs font-semibold text-fg-muted hover:text-foreground transition-colors"
                >
                  <X size={13} />
                  Cancel
                </button>
              ) : (
                <button
                  onClick={handleServerExport}
                  className={cn(
                    "flex items-center justify-center gap-2 h-9 rounded-xl border border-border text-xs font-semibold text-fg-muted hover:text-foreground transition-colors",
                    canUseClientExport ? "px-4" : "flex-1",
                  )}
                >
                  <Server size={13} />
                  Server render
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
