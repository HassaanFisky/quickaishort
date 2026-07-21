"use client";

import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  RefreshCw,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { YouTubePlayer } from "./YouTubePlayer";
import { cn } from "@/lib/utils";
import {
  acceptAttrFromPolicy,
  fetchIngestPolicy,
  FALLBACK_INGEST_POLICY,
  type MediaIngestPolicy,
  validateFileAgainstPolicy,
} from "@/lib/studio/ingestPolicy";

export type IngestUiStatus =
  | "idle"
  | "validating"
  | "uploading"
  | "processing"
  | "ready"
  | "error"
  | "cancelled";

export interface IngestSurfaceProps {
  urlInput: string;
  urlValid: boolean | null;
  youtubePreviewId: string | null;
  isAnalysing: boolean;
  panelCollapsed: boolean;
  currentStage: string;
  videoTitle?: string | null;
  hasSource: boolean;
  ingestStatus: IngestUiStatus;
  ingestProgress: number | null;
  ingestError: string | null;
  onUrlChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onCancelAnalyze: () => void;
  onExpandPanel: () => void;
  onFileChosen: (file: File) => void;
  onCancelUpload: () => void;
  onRetryUpload: () => void;
  onReplace: () => void;
}

/**
 * EP-008 — Equal first-class Upload Video + Paste YouTube URL.
 */
export default function IngestSurface({
  urlInput,
  urlValid,
  youtubePreviewId,
  isAnalysing,
  panelCollapsed,
  currentStage,
  videoTitle,
  hasSource,
  ingestStatus,
  ingestProgress,
  ingestError,
  onUrlChange,
  onAnalyze,
  onCancelAnalyze,
  onExpandPanel,
  onFileChosen,
  onCancelUpload,
  onRetryUpload,
  onReplace,
}: IngestSurfaceProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [policy, setPolicy] = useState<MediaIngestPolicy>(FALLBACK_INGEST_POLICY);
  const [localError, setLocalError] = useState<string | null>(null);
  const [clipboardOk, setClipboardOk] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    void fetchIngestPolicy().then(setPolicy);
    setClipboardOk(
      typeof navigator !== "undefined" &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.read === "function",
    );
  }, []);

  const pickFile = useCallback(() => {
    setLocalError(null);
    fileRef.current?.click();
  }, []);

  const handleFile = useCallback(
    (file: File | undefined | null) => {
      if (!file) return;
      setLocalError(null);
      const v = validateFileAgainstPolicy(file, policy);
      if (!v.ok) {
        setLocalError(v.message);
        return;
      }
      onFileChosen(file);
    },
    [onFileChosen, policy],
  );

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    handleFile(f);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  };

  const pasteClipboardFile = async () => {
    if (!clipboardOk) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const videoType = item.types.find((t) => t.startsWith("video/"));
        if (!videoType) continue;
        const blob = await item.getType(videoType);
        const ext =
          policy.extensions.find((e) => videoType.includes(e.replace(".", ""))) ||
          ".mp4";
        const file = new File([blob], `clipboard${ext}`, { type: videoType });
        handleFile(file);
        return;
      }
      setLocalError("No video file found on the clipboard.");
    } catch {
      setLocalError("Clipboard paste isn’t available in this browser.");
    }
  };

  const busy =
    ingestStatus === "validating" ||
    ingestStatus === "uploading" ||
    ingestStatus === "processing" ||
    isAnalysing;

  const errMsg = localError || ingestError;

  if (panelCollapsed && hasSource) {
    return (
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-card border border-border rounded-xl px-3.5 py-2 flex items-center gap-2.5 shadow-xl"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <span className="text-[10px] font-bold text-fg-muted truncate flex-1 min-w-0">
            {videoTitle ?? urlInput.slice(0, 50) ?? "Video loaded"}
          </span>
          <button
            type="button"
            onClick={onReplace}
            className="text-[9px] font-black uppercase tracking-widest text-primary shrink-0"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onExpandPanel}
            aria-label="Expand import bar"
            className="w-5 h-5 rounded flex items-center justify-center text-fg-subtle hover:text-primary"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttrFromPolicy(policy)}
        className="sr-only"
        onChange={onInputChange}
        aria-hidden
        tabIndex={-1}
      />

      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "bg-card border border-border rounded-2xl p-3 flex flex-col gap-2 shadow-xl",
          dragOver && "border-primary/50 bg-primary/[0.04]",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="flex items-center justify-center pt-1 pb-0.5">
          <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">
            Import Your Video
          </span>
        </div>

        {/* Equal peers: Upload | URL */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-0.5">
          <button
            type="button"
            data-tour-id="ingest.upload"
            onClick={pickFile}
            disabled={busy}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickFile();
              }
            }}
            className={cn(
              "min-h-11 flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3",
              "border-primary/35 bg-primary/[0.07] text-foreground",
              "hover:border-primary/60 hover:bg-primary/[0.12] transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            aria-label="Upload Video from your device"
            aria-describedby="ingest-format-hint"
          >
            <span className="inline-flex items-center gap-1.5 text-[12px] font-bold">
              <Upload className="w-3.5 h-3.5 text-primary" aria-hidden />
              Upload Video
            </span>
            <span className="text-[9px] text-muted-foreground">
              Click, drop, or pick a file
            </span>
          </button>

          <div
            data-tour-id="ingest.url"
            className="min-h-11 flex flex-col justify-center rounded-xl border border-border bg-background px-2 py-2"
          >
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1">
              Paste YouTube URL
            </span>
            <div
              className={cn(
                "flex items-center gap-1.5 border rounded-lg px-2 py-1.5",
                urlValid === true
                  ? "border-emerald-500/40"
                  : urlValid === false
                    ? "border-red-500/40"
                    : "border-border",
              )}
            >
              <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
              <input
                type="url"
                value={urlInput}
                onChange={onUrlChange}
                placeholder="youtube.com/watch?v=…"
                className="flex-1 bg-transparent text-[11px] font-medium outline-none min-w-0"
                aria-label="YouTube URL"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) onAnalyze();
                }}
              />
            </div>
          </div>
        </div>

        <p id="ingest-format-hint" className="px-1 text-[9px] text-muted-foreground text-center">
          {policy.examples_label}
          {clipboardOk ? " · Clipboard paste supported" : ""}
        </p>

        {clipboardOk && (
          <button
            type="button"
            onClick={() => void pasteClipboardFile()}
            disabled={busy}
            className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary self-center"
          >
            Paste video from clipboard
          </button>
        )}

        <AnimatePresence>
          {youtubePreviewId && urlValid && !isAnalysing && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="px-0.5"
            >
              <YouTubePlayer
                videoId={youtubePreviewId}
                className="rounded-xl overflow-hidden w-full max-h-36"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* URL generate / cancel */}
        <div className="flex items-center gap-2 px-0.5 pb-0.5">
          {isAnalysing ? (
            <button
              type="button"
              onClick={onCancelAnalyze}
              className="flex-1 h-9 rounded-xl flex items-center justify-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold"
            >
              <X className="w-3 h-3" />
              {currentStage === "transcribing"
                ? "Transcribing…"
                : currentStage === "analyzing"
                  ? "Analyzing…"
                  : "Loading…"}
            </button>
          ) : (
            <GlowButton
              variant="gradient"
              size="sm"
              onClick={onAnalyze}
              disabled={!urlInput.trim() || busy}
              className="flex-1"
            >
              <Zap size={13} />
              Generate
            </GlowButton>
          )}
          {hasSource && (
            <button
              type="button"
              onClick={onReplace}
              className="h-9 px-3 rounded-xl border border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Replace
            </button>
          )}
        </div>

        {/* Upload progress / errors */}
        {(ingestStatus === "uploading" ||
          ingestStatus === "validating" ||
          ingestStatus === "processing") && (
          <div
            className="px-1 pb-1"
            role="status"
            aria-live="polite"
            aria-valuenow={ingestProgress ?? undefined}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                {ingestStatus === "validating"
                  ? "Checking file…"
                  : ingestStatus === "uploading"
                    ? "Uploading…"
                    : "Preparing preview…"}
              </span>
              {ingestProgress != null && <span>{ingestProgress}%</span>}
              {ingestStatus === "uploading" && (
                <button
                  type="button"
                  onClick={onCancelUpload}
                  className="text-red-400 font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
              )}
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{
                  width:
                    ingestProgress != null
                      ? `${ingestProgress}%`
                      : ingestStatus === "uploading"
                        ? "35%"
                        : "60%",
                }}
              />
            </div>
          </div>
        )}

        {errMsg && (
          <div
            className="flex items-start gap-2 px-2 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[11px]"
            role="alert"
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="flex-1">{errMsg}</span>
            <button
              type="button"
              onClick={onRetryUpload}
              className="inline-flex items-center gap-1 font-bold uppercase tracking-wider shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
