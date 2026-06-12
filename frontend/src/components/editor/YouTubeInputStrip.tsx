"use client";

import type { ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Link2,
  Upload,
  AlertCircle,
} from "lucide-react";
import { GlowButton } from "@/components/ui/GlowButton";
import { YouTubePlayer } from "./YouTubePlayer";
import { cn } from "@/lib/utils";

export interface YouTubeInputStripProps {
  urlInput: string;
  urlValid: boolean | null;
  youtubePreviewId: string | null;
  isAnalysing: boolean;
  backendFailed: boolean;
  panelCollapsed: boolean;
  currentStage: string;
  videoTitle?: string | null;
  onUrlChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onCancel: () => void;
  onFileUpload: () => void;
  onExpandPanel: () => void;
}

export default function YouTubeInputStrip({
  urlInput,
  urlValid,
  youtubePreviewId,
  isAnalysing,
  backendFailed,
  panelCollapsed,
  currentStage,
  videoTitle,
  onUrlChange,
  onAnalyze,
  onCancel,
  onFileUpload,
  onExpandPanel,
}: YouTubeInputStripProps) {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
      <AnimatePresence mode="wait">
        {panelCollapsed ? (
          <motion.div
            key="panel-collapsed"
            initial={{ y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ type: "spring", damping: 24, stiffness: 200 }}
            className="bg-card border border-border rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-xl"
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[10px] font-black text-fg-muted uppercase tracking-widest truncate">
                {videoTitle ?? urlInput.slice(0, 50) ?? "Video loaded"}
              </span>
            </div>
            <button
              onClick={onExpandPanel}
              className="text-[9px] font-black text-primary hover:text-primary/80 uppercase tracking-widest shrink-0 transition-colors"
            >
              Change
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="panel-expanded"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -8, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 100 }}
            className="bg-card border border-border rounded-2xl p-2 flex flex-col gap-1 shadow-xl"
          >
            <div className="flex items-center justify-center pt-2 pb-1">
              {urlValid === true ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" />
                  Video Ready
                </span>
              ) : (
                <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                  Import Your Video
                </span>
              )}
            </div>

            <AnimatePresence>
              {youtubePreviewId && urlValid && !isAnalysing && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-1.5 pb-1"
                >
                  <YouTubePlayer
                    videoId={youtubePreviewId}
                    className="rounded-xl overflow-hidden w-full max-h-40"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-2 px-1.5 pb-1">
              <div
                className={cn(
                  "flex-1 flex items-center gap-2 bg-background border rounded-xl px-3 py-2 transition-colors",
                  urlValid === true
                    ? "border-emerald-500/40"
                    : urlValid === false
                    ? "border-red-500/30"
                    : "border-border",
                )}
              >
                <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={onUrlChange}
                  placeholder="Paste YouTube URL…"
                  className="flex-1 bg-transparent text-[12px] font-medium text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onAnalyze();
                  }}
                />
                {urlValid === false && (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                )}
              </div>
              <GlowButton
                onClick={isAnalysing ? onCancel : onAnalyze}
                disabled={!isAnalysing && !urlInput.trim()}
                className="shrink-0 px-4 py-2 text-[11px]"
              >
                {isAnalysing ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {currentStage === "transcribing"
                      ? "Transcribing"
                      : currentStage === "analyzing"
                      ? "Analyzing"
                      : "Loading"}
                  </span>
                ) : (
                  "Analyze"
                )}
              </GlowButton>
            </div>

            {backendFailed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="px-4 pb-2"
              >
                <button
                  onClick={onFileUpload}
                  className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-colors"
                >
                  <Upload className="w-3 h-3" />
                  Upload MP4 instead
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
