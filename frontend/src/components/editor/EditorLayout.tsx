"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import { useAIPanel } from "@/stores/aiPanelStore";
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { GlowButton } from "@/components/ui/GlowButton";
import QSLogo from "@/components/shared/QSLogo";
import {
  Link2,
  Loader2,
  Zap,
  Sparkles,
  CheckCircle2,
  X,
  AlertCircle,
  Upload,
  Wand2,
  PanelLeft,
  PanelRight,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getVideoInfo } from "@/lib/api";
import { parseYouTubeId } from "@/lib/youtube-utils";
import { PROJECT_TEMPLATES } from "@/lib/project/templates";

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import BottomDock from "./BottomDock";
import VideoCanvas from "./VideoCanvas";
import { YouTubePlayer } from "./YouTubePlayer";
import Sidebar from "@/components/layout/Sidebar";
import { TimelineLoader } from "@/components/ui/TimelineLoader";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import { AIPanel } from "@/components/editor/AIPanel";
import YouTubeInputStrip from "./YouTubeInputStrip";
import VideoWorkspace from "./VideoWorkspace";
import ExportDialog from "./ExportDialog";

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
    aiPanelOpen,
    setExportSetting,
  } = useEditorStore();

  const { runPipeline, cancelPipeline } = useMediaPipeline();
  const { setVideoContext } = useAIPanel();
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

  const [exportOpen, setExportOpen] = useState(false);
  const [localEngineEnabled, setLocalEngineEnabled] = useState(false);
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const hasShownShortcutsRef = useRef(false);
  useEffect(() => {
    setIsAdvancedMode(new URLSearchParams(window.location.search).get("advanced") === "1");
    // First-run welcome toast (once per browser session)
    if (!sessionStorage.getItem("titan_welcome_shown")) {
      sessionStorage.setItem("titan_welcome_shown", "1");
      setTimeout(() => {
        toast("Welcome to QuickAI Editor", {
          description: "Paste a YouTube URL or upload a video to start editing.",
          duration: 5000,
        });
      }, 1000);
    }
  }, []);

  const [urlInput, setUrlInput] = useState("");

  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [youtubePreviewId, setYoutubePreviewId] = useState<string | null>(null);
  const [backendFailed, setBackendFailed] = useState(false);
  const [centerMode, setCenterMode] = useState<"preview" | "effects">("preview");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
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

  // Keyboard shortcut hint — fires once after first video load
  useEffect(() => {
    if (sourceUrl && !hasShownShortcutsRef.current) {
      hasShownShortcutsRef.current = true;
      toast("Pro tip: Use keyboard shortcuts", {
        description: "Ctrl+K for AI Editor · I/O to mark range · M for markers · ? for all shortcuts",
        duration: 8000,
      });
    }
  }, [sourceUrl]);

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

  const isDirectVideoUrl = (url: string) =>
    /\.(mp4|webm|mov)([\?#].*)?$/i.test(url.trim());

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
    } else if (isDirectVideoUrl(val)) {
      setUrlValid(true);
      setYoutubePreviewId(null);
    } else {
      setUrlValid(false);
      setYoutubePreviewId(null);
    }
  };

  const handleAnalyze = async (overrideUrl?: string) => {
    const url = overrideUrl ?? urlInput;
    if (!url.trim()) {
      toast.error("Please paste a YouTube URL or direct video URL first.");
      return;
    }

    // Direct video URL — skip backend, load straight into the pipeline
    if (isDirectVideoUrl(url)) {
      setBackendFailed(false);
      setYoutubePreviewId(null);
      setVideoMetadata({ id: url, url, title: url.split("/").pop() ?? "Video", duration: 0, nativeWidth: 1280, nativeHeight: 720, fps: 30 });
      setSourceUrl(url);
      void runPipeline();
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
      setLastError(null);
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
      if (error && typeof error === "object" && "isAxiosError" in error) {
        const axErr = error as { isAxiosError: boolean; code?: string; response?: { status: number; data: { detail?: string; code?: string } } };
        if (axErr.code === "ERR_NETWORK") {
          errMsg = "Network Error: Could not connect to the backend server.";
        } else if (axErr.response?.data?.code === "YOUTUBE_FETCH_FAILED") {
          toast.warning(
            "YouTube server-side access failed. Upload MP4 instead.",
            { duration: 7000 }
          );
          setProcessing(false, "idle");
          return;
        } else if (axErr.response) {
          errMsg =
            axErr.response.data?.detail ||
            `Server error ${axErr.response.status}`;
        }
      } else if (error instanceof Error) {
        errMsg = error.message || errMsg;
      }
      setLastError(errMsg);
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
      if (file.size > 500 * 1024 * 1024) {
        toast.warning("File is larger than 500 MB — analysis may be slow or time out on first run.", { duration: 6000 });
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
    setIsDraggingOver(false);
    if (e.dataTransfer.files?.[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith("video/")) {
        if (file.size > 500 * 1024 * 1024) {
          toast.warning("File is larger than 500 MB — analysis may be slow or time out on first run.", { duration: 6000 });
        }
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
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingOver(false);
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "editor-shell-bg h-screen w-screen overflow-hidden flex flex-col p-4 gap-4 relative",
        "transition-[padding-left] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
        isSidebarCollapsed ? "md:pl-20" : "md:pl-[256px]"
      )}
    >
      {/* Drag-to-import overlay */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            key="drag-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <div className="absolute inset-0 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary/50 rounded-2xl" />
            <div className="relative flex flex-col items-center gap-3 text-center">
              <Upload className="w-12 h-12 text-primary" />
              <p className="text-base font-bold text-foreground">Drop your video here</p>
              <p className="text-xs text-fg-muted">MP4, WebM, or MOV</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
        {/* Live status module */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Link href="/dashboard" className="shrink-0 mr-1" aria-label="Back to Dashboard">
            <QSLogo variant="mark" size="sm" animated />
          </Link>
          <span className="h-4 w-px bg-foreground/8 shrink-0" />
          <div
            className={cn(
              "flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border backdrop-blur-md transition-colors duration-300",
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
          {isAdvancedMode && (
            <>
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
            </>
          )}
          <button
            onClick={() =>
              setCenterMode(centerMode === "effects" ? "preview" : "effects")
            }
            title={centerMode === "effects" ? "Back to Preview" : "Open Workspace"}
            aria-label={
              centerMode === "effects" ? "Switch to Preview" : "Open Workspace"
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

          {isAdvancedMode && (
            <button
              onClick={() => setLocalEngineEnabled((v) => !v)}
              title={localEngineEnabled ? "Local engine ON — click to disable" : "Use local engine (beta)"}
              aria-label="Toggle local FFmpeg.wasm decode engine"
              className={cn(
                "h-9 px-2 rounded-lg flex items-center gap-1 text-[10px] font-medium border transition-colors",
                localEngineEnabled
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
                  : "bg-card border-border text-fg-muted hover:text-foreground"
              )}
            >
              <Zap size={11} />
              {localEngineEnabled ? "Local" : "Local"}
            </button>
          )}

          <button
            onClick={() => setExportOpen(true)}
            disabled={!sourceUrl || isProcessing}
            title="Export — Shift+Alt+E"
            aria-label="Export video"
            className={cn(
              "h-9 px-3.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-all duration-200",
              sourceUrl && !isProcessing
                ? "bg-primary text-white shadow-[0_2px_12px_-2px_rgba(168,85,247,0.4)] hover:shadow-[0_4px_20px_-2px_rgba(168,85,247,0.5)] hover:-translate-y-px active:scale-[0.97]"
                : "bg-foreground/5 border border-foreground/8 text-fg-muted cursor-not-allowed opacity-50"
            )}
          >
            <Download size={13} />
            Export
          </button>

          <button
            onClick={() => setAIPanelOpen(true)}
            title="AI Editor (Ctrl+K)"
            aria-label="Open AI Editor"
            className={cn(
              "h-9 w-9 rounded-xl flex items-center justify-center border transition-all duration-200",
              aiPanelOpen
                ? "bg-primary/15 border-primary/30 text-primary shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                : "bg-card border-border text-fg-muted hover:text-primary hover:border-primary/20"
            )}
          >
            <Sparkles size={15} />
          </button>

          <LiquidThemeToggle />
        </div>
      </header>

      {/* Error recovery banner */}
      <AnimatePresence>
        {lastError && (
          <motion.div
            key="error-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 truncate">{lastError}</span>
              <button
                onClick={() => setLastError(null)}
                className="shrink-0 hover:text-red-300 transition-colors"
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
              <button
                onClick={() => { setLastError(null); void handleAnalyze(); }}
                className="shrink-0 font-bold hover:text-red-300 transition-colors text-[10px] uppercase tracking-widest"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main workspace — 3-column when ?advanced=1, single center column otherwise */}
      <main className={cn(
        "flex-1 min-h-0 grid grid-cols-1 gap-4 overflow-hidden",
        isAdvancedMode && "lg:grid-cols-[minmax(220px,18%)_1fr_minmax(260px,22%)]"
      )}>

        {/* Left — Viral Suggestions (desktop inline, advanced mode only) */}
        {isAdvancedMode && (
          <section className="hidden lg:flex bg-card border border-border rounded-2xl flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              <LeftPanel />
            </div>
          </section>
        )}

        {/* Center — Stage */}
        <section className="relative flex flex-col items-center justify-center gap-4 min-h-0">
          {/* URL import bar */}
          <YouTubeInputStrip
            urlInput={urlInput}
            urlValid={urlValid}
            youtubePreviewId={youtubePreviewId}
            isAnalysing={isAnalysing}
            backendFailed={backendFailed}
            panelCollapsed={panelCollapsed}
            currentStage={currentStage}
            videoTitle={storeVideoMetadata?.title}
            onUrlChange={handleUrlChange}
            onAnalyze={() => void handleAnalyze()}
            onCancel={handleCancel}
            onFileUpload={() => fileInputRef.current?.click()}
            onExpandPanel={() => setPanelCollapsed(false)}
          />
          {/* ▲ URL bar rendered via YouTubeInputStrip — legacy inline removed */}
          {false && (
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
          )}

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
              ) : !sourceUrl && !youtubePreviewId && !isAnalysing ? (
                <motion.div
                  key="stage-empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="w-full h-full flex flex-col items-center justify-center gap-6 text-center p-8"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full scale-150" />
                    <div className="relative w-20 h-20 rounded-2xl bg-card border border-border flex items-center justify-center shadow-lg">
                      <Image src="/qs-logo.png" alt="" width={40} height={40} className="object-contain opacity-60" />
                    </div>
                  </div>
                  <div className="max-w-sm">
                    <h3 className="text-lg font-bold text-foreground mb-2 tracking-tight">
                      Ready to create
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Paste a YouTube URL above to start. The AI will transcribe, find viral moments, and prepare your editing workspace.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-fg-subtle">
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">Ctrl</kbd>
                      <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">K</kbd>
                      <span>AI Editor</span>
                    </span>
                    <span className="w-px h-3 bg-foreground/10" />
                    <span className="flex items-center gap-1.5">
                      <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">?</kbd>
                      <span>Shortcuts</span>
                    </span>
                  </div>
                  {/* Template selector — quick-start presets */}
                  <div className="w-full max-w-sm">
                    <p className="text-[9px] font-black uppercase tracking-widest text-fg-subtle mb-2">Start from a template</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PROJECT_TEMPLATES.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => {
                            const ar = tpl.aspectRatio === "16:9" ? "9:16" : tpl.aspectRatio;
                            setExportSetting("aspectRatio", ar as "9:16" | "1:1");
                            toast(`Template: ${tpl.label}`, { description: `Aspect ratio set to ${tpl.aspectRatio} · max ${tpl.maxDuration}s`, duration: 3000 });
                          }}
                          className="flex flex-col items-center gap-1 px-1 py-2 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors group"
                        >
                          <div className={cn(
                            "rounded border border-foreground/10 bg-foreground/5 group-hover:border-primary/30 transition-colors",
                            tpl.aspectRatio === "9:16" ? "w-3 h-5" : tpl.aspectRatio === "1:1" ? "w-4 h-4" : "w-5 h-3"
                          )} />
                          <span className="text-[8px] font-bold text-fg-subtle group-hover:text-primary transition-colors leading-tight text-center">{tpl.label.replace(" ", "\n")}</span>
                        </button>
                      ))}
                    </div>
                  </div>
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

        {/* Right — Property Inspector (desktop inline, advanced mode only) */}
        {isAdvancedMode && (
          <section className="hidden lg:flex bg-card border border-border rounded-2xl flex-col overflow-hidden min-h-0">
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              <RightPanel />
            </div>
          </section>
        )}
      </main>

      {/* Timeline */}
      <footer className="h-44 shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden relative">
        <BottomDock />
        {/* RNNoise attribution — required by Mozilla BSD 3-clause */}
        <p className="absolute bottom-1 right-2 text-[9px] text-muted/40 select-none pointer-events-none">
          Noise suppression powered by{" "}
          <a
            href="https://github.com/mozilla/rnnoise"
            target="_blank"
            rel="noopener noreferrer"
            className="underline pointer-events-auto hover:text-muted/70 transition-colors"
          >
            RNNoise
          </a>{" "}
          © Mozilla (BSD&nbsp;3-clause)
        </p>
      </footer>

      {/* Mobile/tablet — Left panel slide-over drawer (advanced mode only) */}
      <AnimatePresence>
        {isAdvancedMode && leftPanelOpen && (
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
                  aria-label="Close clips panel"
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

      {/* Mobile/tablet — Right panel slide-over drawer (advanced mode only) */}
      <AnimatePresence>
        {isAdvancedMode && rightPanelOpen && (
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
                  aria-label="Close properties panel"
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

      {/* AI Editor — full action dispatch panel (Sparkles / Ctrl+K opens this) */}
      <AIPanel />

      {/* Floating AI pill — visible when panel is closed and video is loaded */}
      <AnimatePresence>
        {!aiPanelOpen && storeVideoMetadata && (
          <motion.button
            onClick={() => setAIPanelOpen(true)}
            className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-card/90 backdrop-blur-xl border border-border/50 shadow-[0_8px_32px_rgba(0,0,0,0.3),0_0_0_1px_rgba(168,85,247,0.06)] hover:border-primary/25 hover:shadow-[0_8px_32px_rgba(168,85,247,0.12)] transition-[border-color,box-shadow] duration-300 group"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            aria-label="Open AI Editor"
          >
            <motion.span
              className="w-6 h-6 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary text-xs"
              animate={{ scale: [1, 1.08, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              ✦
            </motion.span>
            <span className="text-[12px] font-semibold text-fg-muted group-hover:text-foreground transition-colors">
              Ask AI to edit...
            </span>
            <kbd className="text-[9px] text-fg-subtle font-mono px-1.5 py-0.5 rounded-md bg-foreground/5 border border-foreground/8">
              {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "⌘K" : "Ctrl+K"}
            </kbd>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Export dialog — opened via Export button in header */}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}

