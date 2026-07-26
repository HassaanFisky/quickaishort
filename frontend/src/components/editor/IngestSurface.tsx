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
import {
  INGEST_PROGRESS_STEPS,
  INGEST_STAGE_LABELS,
  ingestStageIndex,
  type IngestStage,
} from "@/lib/studio/ingestFsm";

export type IngestSurfaceVariant = "hero" | "dock";

export interface IngestSurfaceProps {
  /** hero = empty-stage center composition; dock = loaded/replace overlay */
  variant?: IngestSurfaceVariant;
  urlInput: string;
  urlValid: boolean | null;
  youtubePreviewId: string | null;
  isAnalysing: boolean;
  panelCollapsed: boolean;
  currentStage: string;
  ingestStage: IngestStage;
  videoTitle?: string | null;
  hasSource: boolean;
  ingestUploadProgress: number | null;
  ingestError: string | null;
  ingestFromCache?: boolean;
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
 * EP-008 + M2 — Equal first-class Upload + URL with staged ingest progress.
 * Empty canvas uses hero (center). Loaded video uses dock (safe inset overlay).
 */
export default function IngestSurface({
  variant = "dock",
  urlInput,
  urlValid,
  youtubePreviewId,
  isAnalysing,
  panelCollapsed,
  currentStage,
  ingestStage,
  videoTitle,
  hasSource,
  ingestUploadProgress,
  ingestError,
  ingestFromCache,
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
  const isHero = variant === "hero";

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

  const inFlight =
    ingestStage !== "idle" &&
    ingestStage !== "ready" &&
    ingestStage !== "failed";

  const busy = inFlight || isAnalysing;
  const errMsg = localError || (ingestStage === "failed" ? ingestError : null);
  const stageIdx = ingestStageIndex(ingestStage);
  const stageLabel =
    ingestStage === "analyze" && currentStage === "transcribing"
      ? "Transcribing…"
      : ingestStage === "analyze" && currentStage === "analyzing"
        ? "Finding clips…"
        : INGEST_STAGE_LABELS[ingestStage];

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept={acceptAttrFromPolicy(policy)}
      className="sr-only"
      onChange={onInputChange}
      aria-hidden
      tabIndex={-1}
    />
  );

  if (panelCollapsed && hasSource) {
    return (
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 pointer-events-none">
        {fileInput}
        <motion.div
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="pointer-events-auto bg-card/95 backdrop-blur-sm border border-border rounded-full px-3.5 py-2 flex items-center gap-2.5 shadow-lg"
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] font-medium text-fg-muted truncate flex-1 min-w-0">
            {videoTitle ?? urlInput.slice(0, 50) ?? "Video loaded"}
            {ingestFromCache ? " · cached" : ""}
          </span>
          <button
            type="button"
            onClick={onReplace}
            className="text-[10px] font-semibold text-primary shrink-0 hover:underline"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={onExpandPanel}
            aria-label="Expand import bar"
            className="w-7 h-7 rounded-full flex items-center justify-center text-fg-subtle hover:text-primary hover:bg-foreground/5"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </div>
    );
  }

  const progressBlock = inFlight ? (
    <div
      className={cn("w-full", isHero ? "mt-1" : "px-1 pb-1")}
      role="progressbar"
      aria-live="polite"
      aria-valuenow={
        ingestUploadProgress ??
        Math.round(((stageIdx + 1) / INGEST_PROGRESS_STEPS.length) * 100)
      }
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={stageLabel}
    >
      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
        <span className="inline-flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
          {stageLabel}
        </span>
        {ingestStage === "acquire_meta" && ingestUploadProgress != null && (
          <span className="inline-flex items-center gap-2">
            <span className="tabular-nums">{ingestUploadProgress}%</span>
            <button
              type="button"
              onClick={onCancelUpload}
              className="text-red-400 font-semibold"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
      <div className="flex gap-1.5 mb-1" aria-hidden>
        {INGEST_PROGRESS_STEPS.map((step, i) => {
          const done = (stageIdx >= 0 && i < stageIdx) || step === ingestStage;
          const active = step === ingestStage;
          return (
            <div
              key={step}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                done || active ? "bg-primary" : "bg-foreground/[0.08]",
                active && "opacity-90",
              )}
              title={INGEST_STAGE_LABELS[step]}
            />
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground text-center tabular-nums">
        Step {Math.max(1, stageIdx + 1)} of {INGEST_PROGRESS_STEPS.length}
      </p>
    </div>
  ) : null;

  const errorBlock = errMsg ? (
    <div
      className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[12px] w-full"
      role="alert"
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span className="flex-1 text-left">{errMsg}</span>
      <button
        type="button"
        onClick={onRetryUpload}
        className="inline-flex items-center gap-1 font-semibold shrink-0"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  ) : null;

  const uploadCard = (
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
        "flex flex-col items-center justify-center gap-1.5 rounded-2xl border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        isHero
          ? "min-h-[7.5rem] px-4 py-5 border-primary/40 bg-primary/[0.08] hover:border-primary/65 hover:bg-primary/[0.14]"
          : "min-h-11 px-3 py-3 border-primary/35 bg-primary/[0.07] hover:border-primary/60 hover:bg-primary/[0.12]",
      )}
      aria-label="Upload Video from your device"
      aria-describedby="ingest-format-hint"
    >
      <span
        className={cn(
          "inline-flex items-center gap-2 font-semibold text-foreground",
          isHero ? "text-sm" : "text-[12px] font-bold",
        )}
      >
        <Upload
          className={cn("text-primary", isHero ? "w-4 h-4" : "w-3.5 h-3.5")}
          aria-hidden
        />
        Upload Video
      </span>
      <span className={cn("text-muted-foreground", isHero ? "text-xs" : "text-[9px]")}>
        Click or drop a file
      </span>
    </button>
  );

  const urlCard = (
    <div
      data-tour-id="ingest.url"
      className={cn(
        "flex flex-col justify-center rounded-2xl border border-border bg-background",
        isHero ? "min-h-[7.5rem] px-3 py-3" : "min-h-11 px-2 py-2",
      )}
    >
      <span
        className={cn(
          "font-medium text-muted-foreground px-1 mb-1.5",
          isHero ? "text-[11px]" : "text-[9px] font-bold uppercase tracking-wider",
        )}
      >
        Paste YouTube URL
      </span>
      <div
        className={cn(
          "flex items-center gap-2 border rounded-xl px-2.5",
          isHero ? "py-2.5" : "py-1.5 rounded-lg gap-1.5",
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
          className={cn(
            "flex-1 bg-transparent font-medium outline-none min-w-0",
            isHero ? "text-sm" : "text-[11px]",
          )}
          aria-label="YouTube URL"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) onAnalyze();
          }}
        />
      </div>
    </div>
  );

  const actionsRow = (
    <div className={cn("flex items-center gap-2 w-full", !isHero && "px-0.5 pb-0.5")}>
      {busy ? (
        <button
          type="button"
          onClick={onCancelAnalyze}
          className={cn(
            "flex-1 rounded-xl flex items-center justify-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold",
            isHero ? "h-11 text-sm" : "h-9 text-[11px] font-bold",
          )}
        >
          <X className="w-3.5 h-3.5" />
          {stageLabel}
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
          className={cn(
            "rounded-xl border border-border text-muted-foreground hover:text-foreground",
            isHero
              ? "h-11 px-4 text-xs font-semibold"
              : "h-9 px-3 text-[10px] font-bold uppercase tracking-wider",
          )}
        >
          Replace
        </button>
      )}
    </div>
  );

  if (isHero) {
    return (
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        {fileInput}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "flex flex-col items-center gap-4",
            dragOver && "scale-[1.01]",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="text-center space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              Import your video
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              Drop a file or paste a YouTube link to start editing.
            </p>
          </div>

          <div
            className={cn(
              "w-full rounded-3xl border border-dashed p-3 sm:p-4 transition-colors",
              dragOver
                ? "border-primary/60 bg-primary/[0.06]"
                : "border-border/80 bg-card/40",
            )}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {uploadCard}
              {urlCard}
            </div>
          </div>

          <p
            id="ingest-format-hint"
            className="text-[11px] text-muted-foreground text-center"
          >
            {policy.examples_label}
            {clipboardOk ? " · Clipboard paste supported" : ""}
          </p>

          {clipboardOk && (
            <button
              type="button"
              onClick={() => void pasteClipboardFile()}
              disabled={busy}
              className="text-[11px] font-medium text-muted-foreground hover:text-primary -mt-2"
            >
              Paste video from clipboard
            </button>
          )}

          <AnimatePresence>
            {youtubePreviewId && urlValid && !busy && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="w-full"
              >
                <YouTubePlayer
                  videoId={youtubePreviewId}
                  className="rounded-2xl overflow-hidden w-full max-h-40"
                />
              </motion.div>
            )}
          </AnimatePresence>

          {actionsRow}
          {progressBlock}
          {errorBlock}
        </motion.div>
      </div>
    );
  }

  // Dock — replace / expand while a source exists (safe inset, never flush to edge)
  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
      {fileInput}

      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "bg-card/95 backdrop-blur-sm border border-border rounded-2xl p-3 flex flex-col gap-2 shadow-xl",
          dragOver && "border-primary/50 bg-primary/[0.04]",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-0.5">
          {uploadCard}
          {urlCard}
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
          {youtubePreviewId && urlValid && !busy && (
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

        {actionsRow}
        {progressBlock}
        {errorBlock}
      </motion.div>
    </div>
  );
}
