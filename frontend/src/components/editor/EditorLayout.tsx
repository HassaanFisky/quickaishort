"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import { useAIPanel } from "@/stores/aiPanelStore";
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent, KeyboardEvent } from "react";
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

  const { runPipeline, cancelPipeline, status } = useMediaPipeline();
  const { setOpen: setAICopilotOpen, setVideoContext } = useAIPanel();
  const { isSidebarCollapsed } = useUIStore();

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

  const isAnalysing = (["analyzing", "loading", "transcribing"] as string[]).includes(
    status || ""
  );

  // Collapse URL bar 1.5s after video loads
  useEffect(() => {
    if (!sourceUrl || isAnalysing) {
      setPanelCollapsed(false);
      return;
    }
    const t = setTimeout(() => setPanelCollapsed(true), 1500);
    return () => clearTimeout(t);
  }, [sourceUrl, isAnalysing]);

  // Allow LeftPanel to re-trigger pipeline on retry
  useEffect(() => {
    const handler = () => void runPipeline();
    window.addEventListener("retry-analysis", handler);
    return () => window.removeEventListener("retry-analysis", handler);
  }, [runPipeline]);

  // Watchdog: auto-cancel transcription after 30s if stalled
  useEffect(() => {
    if (currentStage !== "transcribing") return;
    const watchdog = setTimeout(() => {
      if (useEditorStore.getState().currentStage === "transcribing") {
        cancelPipeline();
        setProcessing(false, "idle");
        toast.warning(
          "Transcription timed out â€” try uploading an MP4 for faster processing.",
          { duration: 8000 }
        );
      }
    }, 30_000);
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
        "h-screen w-screen overflow-hidden bg-zinc-950 flex flex-col p-4 gap-4",
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
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full border transition-colors duration-300",
              isProcessing
                ? "text-amber-400 border-amber-400/20 bg-amber-400/8"
                : "text-emerald-400 border-emerald-400/20 bg-emerald-400/8"
            )}
          >
            <Zap className="w-3 h-3" />
            <span className="text-[9px] font-black tracking-[0.2em] uppercase">
              {isProcessing
                ? currentStage === "transcribing"
                  ? "Creating Subtitles..."
                  : currentStage === "analyzing"
                  ? "Finding Viral Hooks..."
                  : "Downloading Video..."
                : "Studio Ready"}
            </span>
          </div>
          <h1 className="text-xl font-black tracking-tighter text-zinc-100 leading-none">
            QuickAI <span className="text-primary italic">Studio</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setCenterMode(centerMode === "effects" ? "preview" : "effects")
            }
            aria-label={
              centerMode === "effects" ? "Switch to Preview" : "Open Effects Studio"
            }
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center border transition-colors",
              centerMode === "effects"
                ? "bg-primary/20 border-primary/30 text-primary"
                : "bg-zinc-900 border-white/5 text-zinc-400 hover:text-zinc-100"
            )}
          >
            <Wand2 size={15} />
          </button>

          <button
            onClick={() => setAICopilotOpen(true)}
            aria-label="Open AI Copilot"
            className="h-9 w-9 rounded-lg flex items-center justify-center bg-zinc-900 border border-white/5 text-zinc-400 hover:text-primary transition-colors"
          >
            <Sparkles size={15} />
          </button>

          <LiquidThemeToggle />
        </div>
      </header>

      {/* Main 3-column workspace */}
      <main className="flex-1 min-h-0 grid grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[minmax(220px,18%)_1fr_minmax(260px,22%)]">

        {/* Left â€” Viral Suggestions */}
        <section className="bg-zinc-900 border border-white/5 rounded-2xl flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <LeftPanel />
          </div>
        </section>

        {/* Center â€” Stage */}
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
                  className="bg-zinc-900 border border-white/5 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 shadow-xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest truncate">
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
                  className="bg-zinc-900 border border-white/5 rounded-2xl p-2 flex flex-col gap-1 shadow-xl"
                >
                  <div className="text-[9px] font-black text-center uppercase tracking-[0.25em] pt-2 pb-1">
                    {urlValid === true ? (
                      <span className="text-emerald-400">Video Ready â€” Hit Generate</span>
                    ) : (
                      <span className="text-zinc-500">Import Your Video</span>
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
                        <div className="relative rounded-xl overflow-hidden border border-emerald-500/20 bg-zinc-800">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://i.ytimg.com/vi/${youtubePreviewId}/mqdefault.jpg`}
                            alt="YouTube thumbnail"
                            className="w-full h-24 object-cover opacity-70"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-zinc-900/60 to-transparent" />
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
                        "flex-1 flex items-center bg-zinc-800 border rounded-xl transition-colors",
                        urlValid === true
                          ? "border-emerald-500/30"
                          : urlValid === false
                          ? "border-red-500/30"
                          : "border-white/5"
                      )}
                    >
                      <span className="pl-3.5 shrink-0">
                        {urlValid === true ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : urlValid === false ? (
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        ) : (
                          <Link2 className="w-4 h-4 text-zinc-600" />
                        )}
                      </span>
                      <input
                        id="youtube-url-input"
                        type="text"
                        placeholder="Paste a YouTube URL..."
                        className="bg-transparent border-none outline-none text-sm w-full text-zinc-100 placeholder:text-zinc-600 h-11 pl-3 pr-4 font-medium"
                        value={urlInput}
                        onChange={handleUrlChange}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
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
          <div className="w-full h-full flex items-center justify-center rounded-2xl overflow-hidden bg-zinc-950 border border-white/5 relative">
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
                      <YouTubePlayer videoId={youtubePreviewId} className="max-w-lg w-full" />
                      <div className="absolute inset-0 bg-zinc-950/70 flex items-center justify-center">
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

        {/* Right â€” Property Inspector */}
        <section className="bg-zinc-900 border border-white/5 rounded-2xl flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full">
            <RightPanel />
          </div>
        </section>
      </main>

      {/* Timeline */}
      <footer className="h-44 shrink-0 bg-zinc-900 border border-white/5 rounded-2xl flex flex-col overflow-hidden relative">
        <BottomDock />
      </footer>

      {/* Floating macro controls â€” 2xl+ only */}
      <div className="fixed right-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40 hidden 2xl:flex">
        <FloatingControls />
      </div>

      {/* AI Copilot â€” fixed overlay, zero layout impact when closed */}
      <AICopilot />
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
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "P", shiftKey: true }));
  };

  const buttons = [
    { icon: Smartphone, title: `Aspect Ratio â€” ${exportSettings.aspectRatio}`, action: cycleAspectRatio },
    { icon: Zap, title: "Auto-Enhance", action: triggerAutoEnhance },
    { icon: Sparkles, title: "AI Pre-Flight", action: triggerPreFlight },
  ];

  return (
    <>
      {buttons.map(({ icon: Icon, title, action }, i) => (
        <button
          key={i}
          onClick={action}
          aria-label={title}
          className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:border-white/10 transition-colors"
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </>
  );
}
