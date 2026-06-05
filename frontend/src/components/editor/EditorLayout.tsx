"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import { useAIPanel } from "@/stores/aiPanelStore";
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import {
  Link2,
  Loader2,
  Zap,
  Smartphone,
  Sparkles,
  CheckCircle2,
  X,
  AlertCircle,
  Upload,
  Wand2,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getVideoInfo } from "@/lib/api";
import { parseYouTubeId } from "@/lib/youtube-utils";

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import BottomDock from "./BottomDock";
import VideoCanvas from "./VideoCanvas";
import { YouTubePlayer } from "./YouTubePlayer";
import Sidebar from "@/components/layout/Sidebar";
import { TimelineLoader } from "@/components/ui/TimelineLoader";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import { AICopilot } from "@/components/editor/AICopilot";
import { AIPanel } from "@/components/editor/AIPanel";
import OnboardingTour from "./OnboardingTour";
import VideoWorkspace from "./VideoWorkspace";
import axios from "axios";

export default function EditorLayout() {
  const {
    setSourceFile,
    setSourceUrl,
    setProcessing,
    isProcessing,
    currentStage,
    sourceUrl,
    setThumbnailUrl: storeThumbnail,
    setVideoMetadata,
  } = useEditorStore();

  const { runPipeline, cancelPipeline } = useMediaPipeline();
  const { setOpen: setAICopilotOpen, setVideoContext } = useAIPanel();
  const setAIPanelOpen = useEditorStore((s) => s.setAIPanelOpen);
  const { isSidebarCollapsed, leftPanelOpen, rightPanelOpen, setLeftPanelOpen, setRightPanelOpen } = useUIStore();

  // Sync transcript to AI panel context after pipeline completes
  const storeTranscript = useEditorStore((s) => s.transcript);
  const storeVideoMetadata = useEditorStore((s) => s.videoMetadata);
  useEffect(() => {
    if (!storeTranscript || !storeVideoMetadata) return;
    const transcriptText = storeTranscript.chunks
      .map((c) => c.text)
      .join(" ")
      .slice(0, 3000);
    setVideoContext({
      id: storeVideoMetadata.id,
      title: storeVideoMetadata.title ?? "YouTube Video",
      transcript: transcriptText,
    });
  }, [storeTranscript, storeVideoMetadata, setVideoContext]);

  const [urlInput, setUrlInput] = useState("");
  
  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [youtubePreviewId, setYoutubePreviewId] = useState<string | null>(null);
  const [backendFailed, setBackendFailed] = useState(false);
  const [centerMode, setCenterMode] = useState<"preview" | "effects">("preview");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoImportedRef = useRef(false);

  // Derived from editorStore.isProcessing so it accurately reflects the pipeline
  // lifecycle: true while setProcessing(true,...) is active, false after
  // setProcessing(false,...). Previously derived from useMediaPipeline.status
  // (transcription worker status), which never left "loading" after init.
  const isAnalysing = isProcessing;

  // Collapse URL bar 1.5s after video loads
  useEffect(() => {
    if (!sourceUrl || isAnalysing) {
      setPanelCollapsed(false);
      return;
    }
    const t = setTimeout(() => setPanelCollapsed(true), 1500);
    return () => clearTimeout(t);
  }, [sourceUrl, isAnalysing]);

  // Keep a ref so the retry listener never needs to re-register when runPipeline
  // recreates (it captures transcription via closure, so it changes every render).
  // A re-registration window between removeEventListener and addEventListener
  // could silently swallow a retry-analysis event during active pipeline state changes.
  const runPipelineRef = useRef(runPipeline);
  useEffect(() => { runPipelineRef.current = runPipeline; });

  useEffect(() => {
    const handler = () => void runPipelineRef.current();
    window.addEventListener("retry-analysis", handler);
    return () => window.removeEventListener("retry-analysis", handler);
  }, []); // stable — ref keeps it current without re-registration

  // Watchdog: 3-minute window covers first-time Whisper model download (~150 MB).
  // cancelPipeline() now terminates the worker as well as aborting the audio-fetch
  // controller, so no ghost clips arrive after the watchdog fires.
  useEffect(() => {
    if (currentStage !== "transcribing") return;
    const watchdog = setTimeout(() => {
      if (useEditorStore.getState().currentStage === "transcribing") {
        cancelPipeline();
        setProcessing(false, "idle");
        toast.info(
          "Transcription is taking too long. Click Generate again — the AI model will be cached and load faster next time.",
          { duration: 12_000 }
        );
      }
    }, 180_000);
    return () => clearTimeout(watchdog);
  }, [currentStage, cancelPipeline, setProcessing]);

  // Auto-import from Chrome extension query params
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (hasAutoImportedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("v");
    const queryUrl = params.get("url");
    let targetUrl = "";
    if (videoId) targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    else if (queryUrl) targetUrl = decodeURIComponent(queryUrl);
    if (targetUrl) {
      hasAutoImportedRef.current = true;
      setUrlInput(targetUrl);
      void handleAnalyze(targetUrl);
    }
  }, []);

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    setBackendFailed(false);
    if (!val.trim()) {
      setUrlValid(null);
      setYoutubePreviewId(null);
      return;
    }
    const videoId = parseYouTubeId(val);
    if (videoId) {
      setUrlValid(true);
      setYoutubePreviewId(videoId);
    } else {
      setUrlValid(false);
      setYoutubePreviewId(null);
    }
  };

  const handleAnalyze = async (overrideUrl?: string) => {
    const url = overrideUrl ?? urlInput;
    if (!url.trim()) {
      toast.error("Please paste a YouTube URL first.");
      return;
    }
    const videoId = parseYouTubeId(url);
    if (videoId) {
      setYoutubePreviewId(videoId);
      setBackendFailed(false);
    }
    try {
      setProcessing(true, "loading");
      toast.info("Connecting to Viral Intelligence Engine...");
      const info = await getVideoInfo(url);
      if (info.code === "YOUTUBE_FETCH_FAILED") {
        toast.warning(
          "YouTube server-side access failed. Preview is still playing. Upload MP4 for AI analysis.",
          { duration: 7000 }
        );
        setBackendFailed(true);
        setProcessing(false, "idle");
        return;
      }
      toast.success(`Found: ${info.title}`);

      // Whisper tiny.en transcribes at ~10–20× realtime in WASM. Videos over
      // 30 minutes (1800s) will likely exceed the 180s watchdog. Surface this
      // before the pipeline starts so users know what to expect.
      if (info.duration && info.duration > 1800) {
        toast.warning(
          `This video is ${Math.round(info.duration / 60)} minutes. Browser AI works best under 30 minutes — analysis may take longer or time out on first use.`,
          { duration: 8000 }
        );
      }

      if (info.thumbnail) storeThumbnail(info.thumbnail);
      setVideoContext({
        id: info.id ?? videoId ?? "",
        title: info.title ?? "YouTube Video",
        transcript: "",
      });
      setVideoMetadata({
        id: info.id ?? videoId ?? "",
        url,
        title: info.title ?? "YouTube Video",
        duration: info.duration ?? 0,
        nativeWidth: 1280,
        nativeHeight: 720,
        fps: 30,
      });
      setSourceUrl(url);
      void runPipeline();
    } catch (error: unknown) {
      setBackendFailed(true);
      let errMsg = "Process interrupted. Please try another link.";
      if (axios.isAxiosError(error)) {
        if (error.code === "ERR_NETWORK") {
          errMsg = "Network Error: Could not connect to the backend server.";
        } else if (error.response?.data?.code === "YOUTUBE_FETCH_FAILED") {
          toast.warning(
            "YouTube server-side access failed. Upload MP4 instead.",
            { duration: 7000 }
          );
          setProcessing(false, "idle");
          return;
        } else if (error.response) {
          errMsg =
            (error.response.data as { detail?: string })?.detail ||
            `Server error ${error.response.status}`;
        }
      } else if (error instanceof Error) {
        errMsg = error.message || errMsg;
      }
      toast.error(`Error: ${errMsg}`);
      setProcessing(false, "idle");
    }
  };

  const handleCancel = () => {
    cancelPipeline();
    setProcessing(false, "idle");
    toast.info("Processing cancelled.");
  };

  const handleFileUpload = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("video/")) {
        toast.error("Please select a video file.");
        return;
      }
      const url = URL.createObjectURL(file);
      setSourceFile(file, url);
      setBackendFailed(false);
      setYoutubePreviewId(null);
      runPipeline();
    },
    [setSourceFile, runPipeline]
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("video/")) {
        const url = URL.createObjectURL(file);
        setSourceFile(file, url);
        runPipeline();
      } else {
        toast.error("Please upload a video file");
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={cn(
        "editor-shell-bg h-screen w-screen overflow-hidden flex flex-col p-4 gap-4",
        "transition-[padding-left] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        isSidebarCollapsed ? "md:pl-20" : "md:pl-[256px]"
      )}
    >
      <Sidebar />

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Header */}
      <header className="flex items-center justify-between shrink-0">
        {/* Live status module — single premium element, no duplicate wordmark
            (the Sidebar already carries brand identity) */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border backdrop-blur-md transition-colors duration-500",
              isProcessing
                ? "border-amber-400/25 bg-amber-400/[0.06]"
                : "border-emerald-400/25 bg-emerald-400/[0.06]"
            )}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {isProcessing && (
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  isProcessing ? "bg-amber-400" : "bg-emerald-400"
                )}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-black tracking-[0.18em] uppercase leading-none whitespace-nowrap",
                isProcessing ? "text-amber-300" : "text-emerald-300"
              )}
            >
              {isProcessing
                ? currentStage === "transcribing"
                  ? "Creating Subtitles"
                  : currentStage === "analyzing"
                  ? "Finding Viral Hooks"
                  : "Downloading Video"
                : "Studio Ready"}
            </span>
          </div>

          {/* Loaded project title — appears only when content exists (progressive) */}
          <AnimatePresence>
            {storeVideoMetadata?.title && (
              <motion.div
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                className="hidden sm:flex items-center gap-2 min-w-0 max-w-[40vw]"
              >
                <span className="h-3.5 w-px bg-foreground/10 shrink-0" />
                <span className="text-[11px] font-bold text-fg-muted truncate leading-none">
                  {storeVideoMetadata.title}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            aria-label="Toggle clips panel"
            className="h-9 w-9 rounded-lg flex items-center justify-center bg-card border border-border text-fg-muted hover:text-foreground transition-colors lg:hidden"
          >
            <PanelLeft size={15} />
          </button>
          <button
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            aria-label="Toggle properties panel"
            className="h-9 w-9 rounded-lg flex items-center justify-center bg-card border border-border text-fg-muted hover:text-foreground transition-colors lg:hidden"
          >
            <PanelRight size={15} />
          </button>
          <button
            onClick={() =>
              setCenterMode(centerMode === "effects" ? "preview" : "effects")
            }
            title={centerMode === "effects" ? "Back to preview" : "Effects studio"}
            aria-label={
              centerMode === "effects" ? "Switch to Preview" : "Open Effects Studio"
            }
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center border transition-colors",
              centerMode === "effects"
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-card border-border text-fg-muted hover:text-foreground"
            )}
          >
            <Wand2 size={15} />
          </button>

          <button
            onClick={() => setAIPanelOpen(true)}
            title="Gemini AI Editor — Ctrl+K"
            aria-label="Open AI Editor"
            className="h-9 w-9 rounded-lg flex items-center justify-center bg-card border border-border text-fg-muted hover:text-primary transition-colors"
          >
            <Sparkles size={15} />
          </button>

          <LiquidThemeToggle />
        </div>
      </header>

      {/* Main 3-column workspace */}
      <main className="flex-1 min-h-0 grid grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(220px,18%)_1fr_minmax(260px,22%)]">

        {/* Left — Viral Suggestions (desktop inline) */}
        <section className="hidden lg:flex bg-card border border-border rounded-2xl flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <LeftPanel />
          </div>
        </section>

        {/* Center — Stage */}
        <section className="relative flex flex-col items-center justify-center gap-4 min-h-0">
          {/* URL import bar */}
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
                      {storeVideoMetadata?.title ?? urlInput.slice(0, 50) ?? "Video loaded"}
                    </span>
                  </div>
                  <button
                    onClick={() => setPanelCollapsed(false)}
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
                      <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Import Your Video</span>
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
                        <div className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://i.ytimg.com/vi/${(youtubePreviewId??"").replace(/[^a-zA-Z0-9_-]/g,"")}/mqdefault.jpg`}
                            alt="YouTube thumbnail"
                            className="w-full h-24 object-cover opacity-70"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-background/70 to-transparent" />
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">
                              Video Found
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-2 p-1.5">
                    <label htmlFor="youtube-url-input" className="sr-only">
                      YouTube video URL
                    </label>
                    <div
                      className={cn(
                        "flex-1 flex items-center bg-muted border rounded-xl transition-colors",
                        urlValid === true
                          ? "border-emerald-500/30"
                          : urlValid === false
                          ? "border-red-500/30"
                          : "border-border"
                      )}
                    >
                      <span className="pl-3.5 shrink-0">
                        {urlValid === true ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : urlValid === false ? (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Link2 className="w-4 h-4 text-muted-foreground" />
                        )}
                      </span>
                      <input
                        id="youtube-url-input"
                        type="text"
                        placeholder="Paste a YouTube URL..."
                        className="bg-transparent border-none outline-none text-sm w-full text-foreground placeholder:text-muted-foreground h-11 pl-3 pr-4 font-medium"
                        value={urlInput}
                        onChange={handleUrlChange}
                        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) =>
                          e.key === "Enter" && !isAnalysing && handleAnalyze()
                        }
                        disabled={isAnalysing}
                      />
                    </div>

                    {isAnalysing ? (
                      <button
                        onClick={handleCancel}
                        className="h-11 px-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors font-black text-[10px] uppercase tracking-widest flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    ) : (
                      <GlowButton
                        variant="premium"
                        size="sm"
                        className="rounded-xl h-11 px-6 font-black text-[10px] uppercase tracking-widest"
                        onClick={() => handleAnalyze()}
                        disabled={!urlInput.trim()}
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 fill-white" />
                          <span>Generate</span>
                        </div>
                      </GlowButton>
                    )}
                  </div>

                  <AnimatePresence>
                    {urlValid === false && urlInput.trim() && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-[9px] text-red-400/80 font-bold px-4 pb-2"
                      >
                        Only YouTube URLs are supported (youtube.com or youtu.be)
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {backendFailed && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-2"
                      >
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          Upload MP4 instead
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Video stage */}
          <div className="editor-stage-bg w-full h-full flex items-center justify-center rounded-2xl overflow-hidden border border-border relative">
            <AnimatePresence mode="wait">
              {isAnalysing ? (
                <motion.div
                  key="stage-analysing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 z-10 flex items-center justify-center"
                >
                  {youtubePreviewId ? (
                    <div className="relative w-full h-full flex items-center justify-center p-16">
                      {/* Video stays fully visible at all times — status floats below, never covers */}
                      <YouTubePlayer videoId={youtubePreviewId} className="max-w-lg w-full" />
                      {/* Thin top progress shimmer — premium, non-blocking */}
                      <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden pointer-events-none">
                        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent animate-[shimmer_1.4s_ease-in-out_infinite]" />
                      </div>
                      {/* Floating glass status chip — bottom-center, never obscures the frame */}
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-base/85 backdrop-blur-xl border border-border shadow-2xl">
                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-foreground whitespace-nowrap">
                            {currentStage === "transcribing"
                              ? "Creating subtitles"
                              : currentStage === "analyzing"
                              ? "Finding viral hooks"
                              : "Loading video"}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <TimelineLoader
                        phases={
                          currentStage === "transcribing"
                            ? ["Transcribing...", "Captioning...", "Building subtitles..."]
                            : currentStage === "analyzing"
                            ? ["Analyzing...", "Scoring virality...", "Finding hooks..."]
                            : ["Downloading...", "Preparing...", "Extracting..."]
                        }
                      />
                    </div>
                  )}
                </motion.div>
              ) : youtubePreviewId && !sourceUrl ? (
                <motion.div
                  key="stage-youtube-preview"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex items-center justify-center p-16"
                >
                  <YouTubePlayer videoId={youtubePreviewId} className="max-w-lg w-full" />
                </motion.div>
              ) : centerMode === "effects" ? (
                <motion.div
                  key="stage-effects"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full overflow-auto"
                >
                  <VideoWorkspace />
                </motion.div>
              ) : (
                <motion.div
                  key="stage-canvas"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <VideoCanvas />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Right — Property Inspector (desktop inline) */}
        <section className="hidden lg:flex bg-card border border-border rounded-2xl flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <RightPanel />
          </div>
        </section>
      </main>

      {/* Timeline */}
      <footer className="h-44 shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden relative">
        <BottomDock />
      </footer>

      {/* Floating macro controls — 2xl+ only */}
      <div className="fixed right-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40 hidden 2xl:flex">
        <FloatingControls />
      </div>

      {/* Mobile/tablet — Left panel slide-over drawer */}
      <AnimatePresence>
        {leftPanelOpen && (
          <>
            <motion.div
              key="left-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setLeftPanelOpen(false)}
            />
            <motion.aside
              key="left-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 top-0 bottom-0 w-80 bg-card border-r border-border z-50 flex flex-col overflow-hidden lg:hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">Viral Clips</span>
                <button
                  onClick={() => setLeftPanelOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                <LeftPanel />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Mobile/tablet — Right panel slide-over drawer */}
      <AnimatePresence>
        {rightPanelOpen && (
          <>
            <motion.div
              key="right-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden"
              onClick={() => setRightPanelOpen(false)}
            />
            <motion.aside
              key="right-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-80 bg-card border-l border-border z-50 flex flex-col overflow-hidden lg:hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">Properties</span>
                <button
                  onClick={() => setRightPanelOpen(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                <RightPanel />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* AI Copilot — simple chat overlay (⋯ icon opens this) */}
      <AICopilot />

      {/* Gemini AI Editor — full action dispatch panel (Sparkles / Ctrl+K opens this) */}
      <AIPanel />

      {/* First-run guided tour — shows once per browser, fully dismissible */}
      <OnboardingTour />
    </div>
  );
}

function FloatingControls() {
  const { exportSettings, setExportSetting } = useEditorStore();

  const ASPECT_CYCLE = ["9:16", "1:1"] as const;
  type AspectOption = (typeof ASPECT_CYCLE)[number];

  const cycleAspectRatio = () => {
    const idx = ASPECT_CYCLE.indexOf(exportSettings.aspectRatio as AspectOption);
    const next = ASPECT_CYCLE[(idx + 1) % ASPECT_CYCLE.length];
    setExportSetting("aspectRatio", next);
    toast.success(`Aspect ratio: ${next}`);
  };

  const triggerAutoEnhance = () => {
    window.dispatchEvent(new Event("trigger-silence-detect"));
    toast.success("Auto-enhancement triggered");
  };

  const triggerPreFlight = () => {
    window.dispatchEvent(new CustomEvent("qai:preflight"));
  };

  const buttons = [
    { icon: Smartphone, title: `Aspect Ratio — ${exportSettings.aspectRatio}`, action: cycleAspectRatio },
    { icon: Zap, title: "Auto-Enhance", action: triggerAutoEnhance },
    { icon: Sparkles, title: "Pre-Flight", action: triggerPreFlight },
  ];

  return (
    <>
      {buttons.map(({ icon: Icon, title, action }, i) => (
        <button
          key={i}
          onClick={action}
          aria-label={title}
          className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center text-fg-muted hover:text-foreground hover:border-border transition-colors"
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </>
  );
}
