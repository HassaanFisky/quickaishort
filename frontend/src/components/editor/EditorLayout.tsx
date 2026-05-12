"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent, KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GlowButton } from "@/components/ui/GlowButton";
import {
  Search,
  Loader2,
  Zap,
  Smartphone,
  Sparkles,
  CheckCircle2,
  X,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { API_URL, getVideoInfo } from "@/lib/api";

// Components
import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import BottomDock from "./BottomDock";
import VideoCanvas from "./VideoCanvas";
import Sidebar from "@/components/layout/Sidebar";
import AgentWorkforce from "./AgentWorkforce";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import axios from "axios";

// YouTube URL regex — accepts watch, shorts, live, embed, and youtu.be short links
const YT_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

function extractYouTubeId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match ? match[1] : null;
}

/** Resolves a YouTube video ID to its best-quality thumbnail URL. */
function getYTThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export default function EditorLayout() {
  const { setSourceFile, setProcessing, isProcessing, currentStage } =
    useEditorStore();
  const { runPipeline, cancelPipeline, status } = useMediaPipeline();
  const [urlInput, setUrlInput] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [urlValid, setUrlValid] = useState<boolean | null>(null); // null = no input, true = valid, false = invalid

  const isAnalysing = (
    ["analyzing", "loading", "transcribing"] as string[]
  ).includes(status || "");

  // Validate URL on every keystroke and update thumbnail preview
  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    if (!val.trim()) {
      setUrlValid(null);
      setThumbnailUrl(null);
      return;
    }
    const videoId = extractYouTubeId(val);
    if (videoId) {
      setUrlValid(true);
      setThumbnailUrl(getYTThumbnail(videoId));
    } else {
      setUrlValid(false);
      setThumbnailUrl(null);
    }
  };

  const handleAnalyze = async (overrideUrl?: string) => {
    const url = overrideUrl ?? urlInput;

    if (!url.trim()) {
      toast.error("Please paste a YouTube URL first.");
      return;
    }

    try {
      setProcessing(true, "loading");
      toast.info("Connecting to Viral Intelligence Engine...");

      const info = await getVideoInfo(url);

      toast.success(`Found: ${info.title}`);

      const proxyUrl = `${API_URL}/api/proxy?url=${encodeURIComponent(url)}`;

      useEditorStore.setState({
        sourceUrl: proxyUrl,
        sourceFile: null,
        currentStage: "loading",
      });

      // REMOVED: setSourceUrl(url) was overwriting the working proxyUrl with a raw YouTube link
      await runPipeline();
    } catch (error: any) {
      console.error(error);

      let errMsg = "Process interrupted. Please try another link.";
      if (axios.isAxiosError(error)) {
        if (error.code === "ERR_NETWORK") {
          errMsg =
            "Network Error: Could not connect to the backend server. Check your connection.";
        } else if (error.response) {
          errMsg =
            error.response.data?.detail ||
            `Server returned error ${error.response.status}`;
        }
      } else {
        errMsg = error?.message || errMsg;
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
      className="relative h-screen w-full overflow-hidden bg-background flex flex-col items-center p-6 md:pl-[256px] pb-8 selection:bg-primary/30 font-sans"
    >
      {/* Dynamic Ambient Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/5 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.02]" />
      </div>

      <Sidebar />

      {/* Main Workspace Container */}
      <div className="relative z-10 w-full h-full flex flex-col gap-6 max-w-[1920px] mx-auto transition-all duration-1000 ease-fluid">

        {/* Top Navigation Bar */}
        <header className="flex items-center justify-between px-4 py-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full border backdrop-blur-md transition-all duration-500",
                  isProcessing
                    ? "text-amber-400 border-amber-400/30 bg-amber-400/10"
                    : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
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
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-foreground/90 leading-none">
              QuickAI <span className="premium-gradient-text italic">Studio</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <LiquidThemeToggle />
          </div>
        </header>

        {/* Central Workspace Grid */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(240px,20%)_1fr_minmax(280px,25%)] gap-6 overflow-hidden">

          {/* Left: Viral Suggestions & Source */}
          <section className="depth-card glass-surface rounded-[2.5rem] p-6 border-foreground/5 shadow-2xl flex flex-col overflow-hidden">
            <LeftPanel />
          </section>

          {/* Center: Creative Engine */}
          <section className="relative flex flex-col items-center justify-center gap-4">
            {/* Dot grid background */}
            <div
              className="absolute inset-0 pointer-events-none rounded-[2.5rem]"
              style={{
                backgroundImage:
                  "radial-gradient(circle, hsl(var(--foreground)/0.04) 1px, transparent 1px)",
                backgroundSize: "28px 28px",
              }}
            />

            {/* The Intelligence Bar (Search Island) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-6">
              <motion.div
                initial={{ y: -30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 100 }}
                className="group relative"
              >
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                <div className="relative glass-surface rounded-[1.5rem] p-2 flex flex-col gap-1 shadow-[0_0_50px_rgba(0,0,0,0.2)] border border-white/10 backdrop-blur-3xl overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

                  <div className="text-[9px] font-black text-center text-primary/50 uppercase tracking-[0.25em] pt-2 pb-1">
                    Import Your Video
                  </div>

                  {/* Thumbnail preview strip — only shown when URL is valid */}
                  <AnimatePresence>
                    {thumbnailUrl && urlValid && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-1.5 pb-1"
                      >
                        <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-foreground/5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={thumbnailUrl}
                            alt="YouTube thumbnail"
                            className="w-full h-20 object-cover opacity-80"
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-background/60 to-transparent" />
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
                    <div
                      className={cn(
                        "relative flex-1 bg-black/20 rounded-xl border transition-all duration-300 shadow-inner",
                        urlValid === true
                          ? "border-emerald-500/40 bg-emerald-500/5"
                          : urlValid === false
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-white/5 hover:border-white/20",
                      )}
                    >
                      {urlValid === true ? (
                        <CheckCircle2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-400 transition-colors" />
                      ) : urlValid === false ? (
                        <AlertCircle className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive transition-colors" />
                      ) : (
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/30 transition-colors" />
                      )}
                      <input
                        id="youtube-url-input"
                        type="text"
                        placeholder="Paste YouTube URL or drag & drop..."
                        className="bg-transparent border-none outline-none text-sm w-full text-foreground placeholder:text-muted-foreground/20 h-11 pl-11 pr-4 font-bold tracking-tight"
                        value={urlInput}
                        onChange={handleUrlChange}
                        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) =>
                          e.key === "Enter" && !isAnalysing && handleAnalyze()
                        }
                        disabled={isAnalysing}
                      />
                      {!isAnalysing && (
                        <button
                          id="try-demo-btn"
                          onClick={() => {
                            const DEMO_URL =
                              "https://www.youtube.com/watch?v=P6FORh8U0Og";
                            // Set UI state for preview
                            setUrlInput(DEMO_URL);
                            const vid = extractYouTubeId(DEMO_URL)!;
                            setThumbnailUrl(getYTThumbnail(vid));
                            setUrlValid(true);
                            // Pass URL directly — avoids stale closure on urlInput state
                            handleAnalyze(DEMO_URL);
                          }}
                          className="text-[9px] font-black uppercase tracking-widest text-primary hover:text-primary/80 transition-colors px-3 h-full border-l border-foreground/5"
                          title="Try with a safe demo video"
                        >
                          Try Demo
                        </button>
                      )}
                    </div>

                    {isAnalysing ? (
                      <button
                        id="cancel-generate-btn"
                        onClick={handleCancel}
                        className="h-11 px-5 rounded-xl bg-destructive/20 border border-destructive/30 text-destructive hover:bg-destructive/30 transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-2 shadow-xl"
                      >
                        <X className="w-4 h-4" />
                        <span>Cancel</span>
                      </button>
                    ) : (
                      <GlowButton
                        id="generate-btn"
                        variant="premium"
                        size="sm"
                        className="rounded-xl h-11 px-6 font-black text-[10px] uppercase tracking-widest shadow-xl"
                        onClick={() => handleAnalyze()}
                        disabled={!urlInput.trim() && !isAnalysing}
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="w-4 h-4 fill-white" />
                          <span>Generate</span>
                        </div>
                      </GlowButton>
                    )}
                  </div>

                  {/* Inline validation hint */}
                  <AnimatePresence>
                    {urlValid === false && urlInput.trim() && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-[9px] text-destructive/80 font-bold px-4 pb-2"
                      >
                        Only YouTube URLs are supported (youtube.com or youtu.be)
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </div>

            {/* The Stage */}
            <div
              className="w-full h-full flex items-center justify-center rounded-[3rem] overflow-hidden bg-background/50 border border-foreground/5 relative group shadow-inner"
              style={{ perspective: "1200px", perspectiveOrigin: "50% 40%" }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.05),transparent_80%)]" />

              <AnimatePresence mode="wait">
                {isAnalysing ? (
                  <motion.div
                    key="workforce"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.05 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute inset-0 z-10 bg-background"
                  >
                    <AgentWorkforce />
                  </motion.div>
                ) : (
                  <motion.div
                    key="canvas"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="w-full h-full flex items-center justify-center"
                  >
                    <VideoCanvas />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Contextual HUD Overlay */}
              {!isAnalysing && (
                <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6 px-8 py-4 glass-surface rounded-2xl border-foreground/10 opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-500 shadow-2xl">
                  <div className="flex items-center gap-2 border-r border-foreground/10 pr-6">
                    <Zap className="w-4 h-4 text-primary fill-primary" />
                    <span className="text-[10px] font-black text-foreground uppercase tracking-[0.2em]">
                      Live Render
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                      Gemini AI Active
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right: Property Inspector & AI Results */}
          <section className="depth-card glass-surface rounded-[2.5rem] p-6 border-foreground/5 shadow-2xl flex flex-col overflow-hidden">
            <RightPanel />
          </section>
        </main>

        {/* Bottom: Sequence Timeline */}
        <footer className="h-44 glass-surface rounded-[3rem] p-6 border-foreground/5 shadow-2xl flex flex-col overflow-hidden relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 bg-foreground/5 rounded-full mt-2" />
          <BottomDock />
        </footer>
      </div>

      {/* Floating Macro Controls */}
      <div className="fixed right-10 top-1/2 -translate-y-1/2 flex flex-col gap-5 z-40 hidden 2xl:flex">
        <FloatingControls />
      </div>
    </div>
  );
}

function FloatingControls() {
  const { exportSettings, setExportSetting } = useEditorStore();

  const cycleAspectRatio = () => {
    const options = ["9:16", "16:9", "1:1"] as const;
    const idx = options.indexOf(exportSettings.aspectRatio as any);
    const next = options[(idx + 1) % options.length];
    setExportSetting("aspectRatio", next);
    toast.success(`Aspect ratio: ${next}`);
  };

  const triggerAutoEnhance = () => {
    window.dispatchEvent(new Event("trigger-silence-detect"));
    toast.success("Auto-enhancement triggered");
  };

  const triggerPreFlight = () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "P", shiftKey: true }),
    );
  };

  const buttons = [
    {
      icon: Smartphone,
      title: `Aspect Ratio — ${exportSettings.aspectRatio}`,
      action: cycleAspectRatio,
    },
    {
      icon: Zap,
      title: "Auto-Enhance — Remove silence & boost",
      action: triggerAutoEnhance,
    },
    {
      icon: Sparkles,
      title: "AI Pre-Flight — Test with audience",
      action: triggerPreFlight,
    },
  ];

  return (
    <>
      {buttons.map(({ icon: Icon, title, action }, i) => (
        <motion.button
          key={i}
          onClick={action}
          title={title}
          whileHover={{ scale: 1.1, x: -5 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 rounded-2xl glass-surface border-foreground/10 flex items-center justify-center hover:border-primary/50 transition-all cursor-pointer group shadow-2xl overflow-hidden relative"
        >
          <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Icon className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors relative z-10" />
        </motion.button>
      ))}
    </>
  );
}
