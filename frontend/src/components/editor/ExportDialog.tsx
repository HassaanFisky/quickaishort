"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Server, Zap } from "lucide-react";
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
import { formatTime } from "@/lib/utils/formatTime";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function ExportDialog({ open, onClose }: ExportDialogProps) {
  const videoElementRef = useEditorStore((s) => s.videoElementRef);
  const duration = useEditorStore((s) => s.duration);
  const dispatchAIActions = useEditorStore((s) => s.dispatchAIActions);
  const markIn = useEditorStore((s) => s.markIn);
  const markOut = useEditorStore((s) => s.markOut);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const suggestions = useEditorStore((s) => s.suggestions);

  const [clientSupported, setClientSupported] = useState<boolean | null>(null);
  const [audioSupported] = useState(() => WebCodecsExporter.hasAudioSupport());
  const [selectedPreset, setSelectedPreset] = useState<ExportPreset>(EXPORT_PRESETS[0]);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [format, setFormat] = useState<"mp4" | "webm">("mp4");
  const exporterRef = useRef<WebCodecsExporter | null>(null);
  const setExportSetting = useEditorStore((s) => s.setExportSetting);

  const canUseClientExport = clientSupported && duration > 0 && duration <= MAX_CLIP_SECONDS && format === "mp4";

  useEffect(() => {
    if (!open) return;
    WebCodecsExporter.isSupported().then(setClientSupported);
  }, [open]);

  // Sync format to store whenever user changes it
  const handleFormatChange = (f: "mp4" | "webm") => {
    setFormat(f);
    setExportSetting("format", f);
  };

  // Compute export range for display — same logic runs inside handleClientExport via getState()
  let rangeStart = 0;
  let rangeEnd = duration;
  if (markIn !== null && markOut !== null && markOut > markIn) {
    rangeStart = Math.min(markIn, markOut);
    rangeEnd = Math.max(markIn, markOut);
  } else if (selectedClipId) {
    const clip = suggestions.find((c) => c.id === selectedClipId);
    if (clip) { rangeStart = clip.start; rangeEnd = clip.end; }
  }
  const range = { start: rangeStart, end: rangeEnd };
  const rangeDuration = rangeEnd - rangeStart;

  const handleServerExport = useCallback(() => {
    dispatchAIActions([{ type: "EXPORT_CLIP", payload: {} }]);
    toast.info("Server render queued — you'll get a download link when ready.");
    onClose();
  }, [dispatchAIActions, onClose]);

  const handleClientExport = useCallback(async () => {
    const storeVideo = videoElementRef?.current;
    const video = storeVideo ?? (document.querySelector("video") as HTMLVideoElement | null);
    if (!video || video.readyState < 2) {
      toast.error("No video loaded — paste a YouTube URL first.");
      return;
    }

    setExporting(true);
    setProgress({ encoded: 0, total: 0, cancelled: false });

    const exporter = new WebCodecsExporter();
    exporterRef.current = exporter;

    try {
      await exporter.init(selectedPreset);

      const fps = selectedPreset.frameRate;

      // Read fresh range from store at encode time
      const { markIn: mi, markOut: mo, selectedClipId: selId, suggestions: clips, duration: dur, videoMetadata } =
        useEditorStore.getState();

      let start = 0;
      let end = dur;
      if (mi !== null && mo !== null && mo > mi) {
        start = Math.min(mi, mo);
        end = Math.max(mi, mo);
      } else if (selId) {
        const clip = clips.find((c) => c.id === selId);
        if (clip) { start = clip.start; end = clip.end; }
      }

      const exportDuration = end - start;
      const totalFrames = Math.ceil(exportDuration * fps);
      setProgress({ encoded: 0, total: totalFrames, cancelled: false });

      const wasPlaying = !video.paused;
      video.pause();
      const originalTime = video.currentTime;

      for (let f = 0; f < totalFrames; f++) {
        if (exporter["cancelled"]) break;
        const timeSec = start + f / fps;
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
        const videoTitle = videoMetadata?.title ?? "export";
        const safeName = videoTitle.replace(/[^a-zA-Z0-9_\- ]/g, "").trim().slice(0, 60) || "export";
        const filename = `${safeName}_${selectedPreset.label.replace(/\s/g, "_")}.mp4`;
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
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
  }, [videoElementRef, selectedPreset, onClose]);

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

            {/* Format toggle */}
            <div className="mb-3">
              <p className="text-xs text-fg-muted mb-2 font-medium">Format</p>
              <div className="flex gap-2">
                {(["mp4", "webm"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => handleFormatChange(fmt)}
                    disabled={exporting}
                    aria-pressed={format === fmt}
                    className={cn(
                      "text-[10px] font-bold px-3 py-1.5 rounded-lg border transition-colors uppercase",
                      format === fmt
                        ? "bg-primary/20 border-primary/40 text-primary"
                        : "bg-card border-border text-fg-muted hover:text-foreground",
                    )}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
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

            {/* Export range indicator */}
            {!exporting && duration > 0 && (
              <div className="mb-4 p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center justify-between text-[10px] text-fg-muted mb-1">
                  <span className="font-black uppercase tracking-widest">Export Range</span>
                  <span className="font-mono tabular-nums">
                    {formatTime(range.start)} → {formatTime(range.end)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{
                        marginLeft: `${duration > 0 ? (range.start / duration) * 100 : 0}%`,
                        width: `${duration > 0 ? (rangeDuration / duration) * 100 : 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-fg-muted tabular-nums">
                    {Math.round(rangeDuration)}s
                  </span>
                </div>
                {markIn !== null && markOut !== null && (
                  <p className="text-[9px] text-primary mt-1">Using I/O marks</p>
                )}
                {markIn === null && selectedClipId && (
                  <p className="text-[9px] text-emerald-400 mt-1">Using selected clip range</p>
                )}
              </div>
            )}

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

            {/* Client export notice + audio/video status */}
            {canUseClientExport && !exporting && (
              <div className="mb-4 space-y-2">
                <p className="text-[11px] text-fg-muted flex items-center gap-1.5">
                  <Zap size={11} className="text-primary shrink-0" />
                  Hardware-accelerated local export — stays on your device, instant download.
                </p>
                <div className="flex items-center gap-3 text-[9px] text-fg-subtle">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />
                    <span>Video</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className={cn("w-1.5 h-1.5 rounded-full inline-block shrink-0", audioSupported ? "bg-amber-400" : "bg-foreground/20")} />
                    <span>Audio {audioSupported ? "(basic)" : "(browser unsupported)"}</span>
                  </span>
                </div>
              </div>
            )}
            {!canUseClientExport && !exporting && (
              <p className="text-[11px] text-fg-muted mb-4">
                {duration > MAX_CLIP_SECONDS
                  ? `Clip is ${Math.round(duration)}s (> ${MAX_CLIP_SECONDS}s) — use shorter clip or server render.`
                  : "WebCodecs not available in this browser — try Chrome 94+ or use server render."}
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
