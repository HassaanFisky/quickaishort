"use client";

import { useEditorStore } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import { useAIPanel } from "@/stores/aiPanelStore";
import React, { useState, useRef, useCallback, useEffect } from "react";
import type { DragEvent, ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import QSLogo from "@/components/shared/QSLogo";
import {
  Zap,
  Sparkles,
  X,
  AlertCircle,
  Upload,
  Wand2,
  PanelLeft,
  PanelRight,
  Download,
  SlidersHorizontal,
  GripHorizontal,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { parseYouTubeId } from "@/lib/youtube-utils";
import { PROJECT_TEMPLATES } from "@/lib/project/templates";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useSwipeGesture } from "@/hooks/useTouchGestures";
import { FALLBACK_INGEST_POLICY } from "@/lib/studio/ingestPolicy";
import {
  consumeTourReplay,
  fetchOnboarding,
} from "@/lib/studio/onboarding";
import { useIngestLifecycle } from "@/hooks/useIngestLifecycle";
import {
  INGEST_STAGE_LABELS,
  isDirectVideoUrl,
} from "@/lib/studio/ingestFsm";
import { loadIngestSession } from "@/lib/studio/ingestSession";
import { loadIngestArtifact } from "@/lib/studio/ingestArtifacts";

import LeftPanel from "./LeftPanel";
import RightPanel from "./RightPanel";
import BottomDock from "./BottomDock";
import VideoCanvas from "./VideoCanvas";
import { YouTubePlayer } from "./YouTubePlayer";
import Sidebar from "@/components/layout/Sidebar";
import { TimelineLoader } from "@/components/ui/TimelineLoader";
import { LiquidThemeToggle } from "@/components/shared/LiquidThemeToggle";
import { AIPanel } from "@/components/editor/AIPanel";
import IngestSurface from "./IngestSurface";
import VideoWorkspace from "./VideoWorkspace";
import ExportDialog from "./ExportDialog";

const EditorOnboardingTour = dynamic(
  () => import("./EditorOnboardingTour"),
  { ssr: false },
);

export default function EditorLayout() {
  const {
    setProcessing,
    isProcessing,
    currentStage,
    sourceUrl,
    sourceFile,
    setExportSetting,
    selectedClipId,
    ingestStage,
    ingestFailMessage,
    ingestUploadProgress,
    ingestFromCache,
  } = useEditorStore();

  const { runPipeline, cancelPipeline } = useMediaPipeline();
  const { setVideoContext } = useAIPanel();
  const setAIPanelOpen = useEditorStore((s) => s.setAIPanelOpen);
  const { isSidebarCollapsed, leftPanelOpen, rightPanelOpen, setLeftPanelOpen, setRightPanelOpen } = useUIStore();

  const {
    ingestUrl,
    ingestFile,
    retryAnalyze,
    cancelUpload,
    cancelAnalyze,
    lastFileRef,
  } = useIngestLifecycle({ runPipeline, cancelPipeline });

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
    const onDub = (ev: Event) => {
      const detail = (ev as CustomEvent<{ targetLang?: string; mode?: string }>).detail;
      useUIStore.getState().setActiveTool("dub");
      useUIStore.getState().setRightPanelOpen(true);
      useEditorStore.getState().setAIPanelOpen(true);
      // Persist intent for DubPanel auto-start
      if (typeof window !== "undefined" && detail) {
        sessionStorage.setItem(
          "qai:dub-intent",
          JSON.stringify({
            targetLang: detail.targetLang ?? "es",
            mode: detail.mode ?? "full_dub",
          }),
        );
      }
    };
    window.addEventListener("qai:dub-video", onDub as EventListener);
    return () => window.removeEventListener("qai:dub-video", onDub as EventListener);
  }, []);

  useEffect(() => {
    setIsAdvancedMode(new URLSearchParams(window.location.search).get("advanced") === "1");
    // First-run welcome toast (once per browser session)
    if (!sessionStorage.getItem("titan_welcome_shown")) {
      sessionStorage.setItem("titan_welcome_shown", "1");
      setTimeout(() => {
        toast("Welcome to QuickAI Studio", {
          description: "Upload a video or paste a YouTube URL to start editing.",
          duration: 5000,
        });
      }, 1000);
    }
  }, []);

  const [urlInput, setUrlInput] = useState("");

  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [youtubePreviewId, setYoutubePreviewId] = useState<string | null>(null);
  const [centerMode, setCenterMode] = useState<"preview" | "effects">("preview");
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const hasAutoImportedRef = useRef(false);
  const aiPanelOpen = useEditorStore((s) => s.aiPanelOpen);

  // Mobile inspector bottom-sheet — lightweight (non-advanced-mode) replacement
  // for the desktop inline RightPanel, since RightPanel is otherwise only
  // mounted inside isAdvancedMode-gated sections below.
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const mobileSheetRef = useRef<HTMLDivElement | null>(null);
  const lastAutoOpenedClipId = useRef<string | null>(null);

  useSwipeGesture(mobileSheetRef, {
    enabled: isMobile && mobileInspectorOpen,
    onSwipe: (direction, distance) => {
      if (direction === "down" && distance > 60) setMobileInspectorOpen(false);
    },
  });

  useEffect(() => {
    if (!isMobile || isAdvancedMode) return;
    const openSheet = () => setMobileInspectorOpen(true);
    window.addEventListener("qai:mobile-inspector-open", openSheet);
    return () => window.removeEventListener("qai:mobile-inspector-open", openSheet);
  }, [isMobile, isAdvancedMode]);

  useEffect(() => {
    if (!isMobile || isAdvancedMode) return;
    if (selectedClipId && selectedClipId !== lastAutoOpenedClipId.current) {
      lastAutoOpenedClipId.current = selectedClipId;
      setMobileInspectorOpen(true);
    }
  }, [isMobile, isAdvancedMode, selectedClipId]);

  // Derived from editorStore.isProcessing so it accurately reflects the pipeline
  // lifecycle: true while setProcessing(true,...) is active, false after
  // setProcessing(false,...). Previously derived from useMediaPipeline.status
  // (transcription worker status), which never left "loading" after init.
  const isAnalysing = isProcessing;

  // Collapse URL bar 1.5s after video loads (and ingest reached ready)
  useEffect(() => {
    if (!sourceUrl || isAnalysing || (ingestStage !== "ready" && ingestStage !== "idle")) {
      if (ingestStage !== "ready") setPanelCollapsed(false);
      return;
    }
    const t = setTimeout(() => setPanelCollapsed(true), 1500);
    return () => clearTimeout(t);
  }, [sourceUrl, isAnalysing, ingestStage]);

  // Keyboard shortcut hint — fires once after first video load
  useEffect(() => {
    if (sourceUrl && !hasShownShortcutsRef.current) {
      hasShownShortcutsRef.current = true;
      toast("Pro tip: Use keyboard shortcuts", {
        description: "Shift+Alt+A for AI Editor · I/O to mark range · M for markers · ? for all shortcuts",
        duration: 8000,
      });
    }
  }, [sourceUrl]);

  // EP-005 / U1 — chat is the control plane once media is loaded
  useEffect(() => {
    if (storeVideoMetadata) {
      setAIPanelOpen(true);
    }
  }, [storeVideoMetadata, setAIPanelOpen]);

  const [timelineExpanded, setTimelineExpanded] = useState(false);
  useEffect(() => {
    try {
      setTimelineExpanded(sessionStorage.getItem("qai_timeline_expanded") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleTimelineExpanded = useCallback(() => {
    setTimelineExpanded((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem("qai_timeline_expanded", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Keep a ref so the retry listener never needs to re-register when retryAnalyze
  // recreates. Routes through canonical FSM (not raw runPipeline).
  const retryAnalyzeRef = useRef(retryAnalyze);
  useEffect(() => { retryAnalyzeRef.current = retryAnalyze; });

  useEffect(() => {
    const handler = () => void retryAnalyzeRef.current();
    window.addEventListener("retry-analysis", handler);
    return () => window.removeEventListener("retry-analysis", handler);
  }, []);

  // Watchdog: 3-minute window covers first-time Whisper model download (~150 MB).
  // cancelPipeline() now terminates the worker as well as aborting the audio-fetch
  // controller, so no ghost clips arrive after the watchdog fires.
  useEffect(() => {
    if (currentStage !== "transcribing") return;
    const watchdog = setTimeout(() => {
      if (useEditorStore.getState().currentStage === "transcribing") {
        cancelPipeline();
        setProcessing(false, "idle");
        const st = useEditorStore.getState();
        if (st.ingestStage === "analyze") {
          st.setIngestStage("ready");
        } else if (st.ingestStage !== "ready" && st.ingestStage !== "failed") {
          st.setIngestStage("analyze");
          st.setIngestStage("ready");
        }
        toast.info(
          "Transcription is taking too long. Click Generate again — the AI model will be cached and load faster next time.",
          { duration: 12_000 }
        );
      }
    }, 180_000);
    return () => clearTimeout(watchdog);
  }, [currentStage, cancelPipeline, setProcessing]);

  // Auto-import from Chrome extension query params
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
      void ingestUrl(targetUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot URL bootstrap
  }, []);

  // M3 — session restore: if refresh cleared Zustand but IDB artifact exists, re-ingest via FSM (cache hit → no Gemini).
  const hasSessionRestoredRef = useRef(false);
  useEffect(() => {
    if (hasSessionRestoredRef.current || hasAutoImportedRef.current) return;
    hasSessionRestoredRef.current = true;
    const snap = loadIngestSession();
    if (!snap?.url) return;
    if (useEditorStore.getState().sourceUrl || useEditorStore.getState().sourceFile) return;
    setUrlInput(snap.url);
    void loadIngestArtifact(snap.fingerprint).then((art) => {
      if (!art) return;
      if (useEditorStore.getState().sourceUrl) return;
      void ingestUrl(snap.url);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot recovery
  }, []);

  // EP-008 — lazy interactive tour (once / replay)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (consumeTourReplay()) {
          if (!cancelled) {
            setTourStep(0);
            setShowTour(true);
          }
          return;
        }
        const data = await fetchOnboarding();
        if (!cancelled && data.auto_show) {
          setTourStep(data.editor_v1.step_index || 0);
          setShowTour(true);
        }
      } catch {
        /* non-blocking */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirectVideoUrlCheck = isDirectVideoUrl;

  const handleUrlChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    if (!val.trim()) {
      setUrlValid(null);
      setYoutubePreviewId(null);
      return;
    }
    const videoId = parseYouTubeId(val);
    if (videoId) {
      setUrlValid(true);
      setYoutubePreviewId(videoId);
    } else if (isDirectVideoUrlCheck(val)) {
      setUrlValid(true);
      setYoutubePreviewId(null);
    } else {
      setUrlValid(false);
      setYoutubePreviewId(null);
    }
  };

  const handleCancel = () => {
    cancelAnalyze();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
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
              <p className="text-xs text-fg-muted">
                {FALLBACK_INGEST_POLICY.examples_label}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Sidebar />

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
              ingestStage === "failed"
                ? "border-red-400/25 bg-red-400/[0.06]"
                : isProcessing || (ingestStage !== "idle" && ingestStage !== "ready")
                  ? "border-amber-400/25 bg-amber-400/[0.06]"
                  : "border-emerald-400/25 bg-emerald-400/[0.06]"
            )}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {ingestStage !== "failed" &&
                ingestStage !== "idle" &&
                ingestStage !== "ready" && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60 animate-ping" />
                )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  ingestStage === "failed"
                    ? "bg-red-400"
                    : isProcessing || (ingestStage !== "idle" && ingestStage !== "ready")
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                )}
              />
            </span>
            <span
              className={cn(
                "text-[10px] font-black tracking-[0.18em] uppercase leading-none whitespace-nowrap",
                ingestStage === "failed"
                  ? "text-red-300"
                  : isProcessing || (ingestStage !== "idle" && ingestStage !== "ready")
                    ? "text-amber-300"
                    : "text-emerald-300"
              )}
            >
              {ingestStage === "failed"
                ? "Ingest Failed"
                : ingestStage === "analyze" && currentStage === "transcribing"
                  ? "Creating Subtitles"
                  : ingestStage === "analyze" && currentStage === "analyzing"
                    ? "Finding Viral Hooks"
                    : ingestStage !== "idle" && ingestStage !== "ready"
                      ? INGEST_STAGE_LABELS[ingestStage].replace(/…$/, "")
                      : isProcessing
                        ? "Working…"
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
                className="h-9 w-9 rounded-xl flex items-center justify-center bg-card border border-border text-fg-muted hover:text-foreground transition-all duration-200 lg:hidden"
              >
                <PanelLeft size={15} />
              </button>
              <button
                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                aria-label="Toggle properties panel"
                className="h-9 w-9 rounded-xl flex items-center justify-center bg-card border border-border text-fg-muted hover:text-foreground transition-all duration-200 lg:hidden"
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
              "h-9 w-9 rounded-xl flex items-center justify-center border transition-all duration-200",
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
                "h-9 px-2 rounded-xl flex items-center gap-1 text-[10px] font-bold border transition-all duration-200",
                localEngineEnabled
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-400 hover:bg-amber-500/25"
                  : "bg-card border-border text-fg-muted hover:text-foreground"
              )}
            >
              <Zap size={11} />
              {localEngineEnabled ? "Local On" : "Local Off"}
            </button>
          )}

          <button
            data-tour-id="export.button"
            onClick={() => setExportOpen(true)}
            disabled={!sourceUrl || isProcessing}
            title={
              sourceUrl && !isProcessing
                ? "Export — Shift+Alt+E"
                : isProcessing
                  ? "Export is disabled while your video is processing"
                  : "Load a video to enable export"
            }
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
            onClick={() => setAIPanelOpen(!aiPanelOpen)}
            title={aiPanelOpen ? "Close AI Editor (Shift+Alt+A)" : "Open AI Editor (Shift+Alt+A)"}
            aria-label={aiPanelOpen ? "Close AI Editor" : "Open AI Editor"}
            aria-pressed={aiPanelOpen}
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

      {/* Error recovery banner — ingest FSM terminal failures */}
      <AnimatePresence>
        {ingestStage === "failed" && ingestFailMessage && (
          <motion.div
            key="error-banner"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 truncate">{ingestFailMessage}</span>
              <button
                onClick={() => useEditorStore.getState().resetIngestLifecycle()}
                className="shrink-0 hover:text-red-300 transition-colors"
                aria-label="Dismiss error"
              >
                <X size={13} />
              </button>
              <button
                onClick={() => {
                  if (lastFileRef.current) void ingestFile(lastFileRef.current);
                  else void ingestUrl(urlInput);
                }}
                className="shrink-0 font-bold hover:text-red-300 transition-colors text-[10px] uppercase tracking-widest"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main workspace row — grid + docked AI panel. The AI panel is a layout
          sibling so the canvas resizes when it opens and is never overlaid. */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <main className={cn(
          "flex-1 min-w-0 min-h-0 grid grid-cols-1 gap-4 overflow-hidden",
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
            <IngestSurface
              urlInput={urlInput}
              urlValid={urlValid}
              youtubePreviewId={youtubePreviewId}
              isAnalysing={isAnalysing}
              panelCollapsed={panelCollapsed}
              currentStage={currentStage}
              ingestStage={ingestStage}
              videoTitle={storeVideoMetadata?.title}
              hasSource={Boolean(sourceUrl || sourceFile)}
              ingestUploadProgress={ingestUploadProgress}
              ingestError={ingestFailMessage}
              ingestFromCache={ingestFromCache}
              onUrlChange={handleUrlChange}
              onAnalyze={() => void ingestUrl(urlInput)}
              onCancelAnalyze={handleCancel}
              onExpandPanel={() => setPanelCollapsed(false)}
              onFileChosen={(f) => void ingestFile(f)}
              onCancelUpload={cancelUpload}
              onRetryUpload={() => {
                if (lastFileRef.current) void ingestFile(lastFileRef.current);
                else void ingestUrl(urlInput);
              }}
              onReplace={() => {
                setPanelCollapsed(false);
                useEditorStore.getState().resetIngestLifecycle();
              }}
            />
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
                        Paste a YouTube URL, drop a video file, or enter any direct video link.
                        <span className="text-[10px] text-fg-subtle mt-1 block">
                          Supports MP4, WebM, MOV · YouTube · Direct URLs
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-fg-subtle">
                      <span className="flex items-center gap-1.5">
                        <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">Shift</kbd>
                        <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">Alt</kbd>
                        <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/8 font-mono text-[9px]">A</kbd>
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

        {/* AI Editor — docked right column on desktop, bottom sheet on mobile.
          Toggled via header Sparkles or Shift+Alt+A. */}
        <AIPanel />
      </div>

      {/* Timeline — EP-005: collapsed monitor by default; expand on demand */}
      <footer
        data-tour-id="timeline.dock"
        className={cn(
          "shrink-0 bg-card border border-border rounded-2xl flex flex-col overflow-hidden relative transition-[height] duration-300",
          timelineExpanded || isAdvancedMode ? "h-[clamp(11rem,22vh,14rem)]" : "h-14",
        )}
      >
        <div className="flex items-center justify-between px-3 h-14 shrink-0 border-b border-border/60">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-fg-muted">
            Timeline
          </span>
          <button
            type="button"
            onClick={toggleTimelineExpanded}
            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-foreground/5"
            aria-expanded={timelineExpanded || isAdvancedMode}
          >
            {timelineExpanded || isAdvancedMode ? "Collapse" : "Expand"}
          </button>
        </div>
        {(timelineExpanded || isAdvancedMode) && (
          <>
            <div className="flex-1 min-h-0 overflow-hidden">
              <BottomDock />
            </div>
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
          </>
        )}
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

      {/* Mobile — Inspector FAB + bottom-sheet (simple/non-advanced mode only;
          advanced mode already has the right-side slide-over drawer above). */}
      {isMobile && !isAdvancedMode && storeVideoMetadata && (
        <button
          onClick={() => setMobileInspectorOpen(true)}
          aria-label="Open clip inspector"
          className="fixed bottom-[4.5rem] right-4 z-40 h-14 w-14 rounded-full bg-card/90 backdrop-blur-xl border border-border/50 shadow-[0_8px_32px_rgba(0,0,0,0.3)] flex items-center justify-center text-fg-muted hover:text-primary hover:border-primary/30 transition-colors touch-manipulation"
        >
          <SlidersHorizontal size={18} />
        </button>
      )}
      <AnimatePresence>
        {isMobile && !isAdvancedMode && mobileInspectorOpen && (
          <>
            <motion.div
              key="mobile-inspector-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setMobileInspectorOpen(false)}
            />
            <motion.div
              key="mobile-inspector-sheet"
              ref={mobileSheetRef}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed left-0 right-0 bottom-0 z-50 max-h-[75vh] bg-card border-t border-border rounded-t-3xl flex flex-col overflow-hidden touch-pan-y"
            >
              <div className="flex flex-col items-center pt-2.5 pb-1 shrink-0">
                <GripHorizontal size={16} className="text-foreground/20" aria-hidden="true" />
              </div>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-fg-muted">Properties</span>
                <button
                  onClick={() => setMobileInspectorOpen(false)}
                  aria-label="Close properties panel"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
                <RightPanel />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Export dialog — opened via Export button in header */}
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      {showTour && (
        <EditorOnboardingTour
          initialStep={tourStep}
          onFinished={() => setShowTour(false)}
        />
      )}
    </div>
  );
}

