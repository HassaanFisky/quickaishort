"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import Pusher, { type Channel } from "pusher-js";
import { toast } from "sonner";
import {
  FileText,
  Film,
  Mic2,
  Rocket,
  Wand2,
  Upload,
  X,
  Search,
  Check,
  Loader2,
  Download,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimelineLoader } from "@/components/ui/TimelineLoader";
import { UploadLoader } from "@/components/ui/UploadLoader";
import { useADKStore, type StockClip } from "@/stores/adkStore";
import {
  API_URL,
  uploadADKFootage,
  searchStockVideos,
  runADKGenerate,
  buildExportDownloadUrl,
} from "@/lib/api";
import axios from "axios";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOICES = [
  { id: "en-US-Neural2-D", name: "Atlas", tag: "Professional", gender: "M" },
  { id: "en-US-Neural2-A", name: "Nova", tag: "Casual", gender: "M" },
  { id: "en-US-Neural2-C", name: "Luna", tag: "Warm", gender: "F" },
  { id: "en-US-Neural2-F", name: "Aria", tag: "Energetic", gender: "F" },
  { id: "en-GB-Neural2-B", name: "Sterling", tag: "British", gender: "M" },
  { id: "en-AU-Neural2-B", name: "Sydney", tag: "Australian", gender: "M" },
] as const;

const QUALITY_OPTIONS = [
  { id: "low", label: "Fast", desc: "Quick preview" },
  { id: "medium", label: "Balanced", desc: "Best for sharing" },
  { id: "high", label: "Cinema", desc: "Max quality" },
] as const;

// ---------------------------------------------------------------------------
// Script panel — internal logic unchanged
// ---------------------------------------------------------------------------

function ScriptStep() {
  const { script, setScript } = useADKStore();
  const { data: session } = useSession();
  const [generating, setGenerating] = useState(false);
  const wordCount = script.trim() ? script.trim().split(/\s+/).length : 0;
  const estSeconds = Math.round(wordCount / 2.5);

  async function handleAIGenerate() {
    if (!script.trim()) {
      toast.error("Enter a topic or rough idea first.");
      return;
    }
    setGenerating(true);
    try {
      const userId = session?.user?.id ?? session?.user?.email ?? "anonymous";
      const { data } = await axios.post(`${API_URL}/api/direct`, {
        input_text: script,
        user_id: userId,
      });
      const result = data?.director_result;
      if (result?.storyboard?.length) {
        const expanded = result.storyboard
          .map((s: { caption?: string }) => s.caption ?? "")
          .filter(Boolean)
          .join("\n\n");
        setScript(expanded || script);
        toast.success("Script enhanced by AI Director.");
      } else {
        toast.info("No enhancements returned — your script looks good.");
      }
    } catch (err: unknown) {
      let msg = "AI generation failed — please try again.";
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (!err.response) {
          msg = "Connection lost — check your internet.";
        } else if (status === 401 || status === 403) {
          msg = "Sign in to use ADK Studio.";
        } else if (status === 429) {
          msg = "Rate limit exceeded — try again later.";
        } else if (status === 503) {
          msg = "AI service not configured — GEMINI_API_KEY missing on server.";
        } else if (status && status >= 500) {
          const detail = (err.response.data as { detail?: string })?.detail;
          msg = detail ? `AI error: ${detail}` : `Server error (${status}) — please try again.`;
        }
      }
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Your Script
        </p>
        <button
          onClick={handleAIGenerate}
          disabled={generating}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all",
            "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20",
            generating && "opacity-60 cursor-not-allowed",
          )}
        >
          {generating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wand2 className="w-3.5 h-3.5" />
          )}
          AI Enhance
        </button>
      </div>

      {generating ? (
        <div className="flex justify-center py-8">
          <TimelineLoader
            phases={["Scripting...", "Analyzing...", "Enhancing...", "Refining..."]}
          />
        </div>
      ) : (
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={`Write your short's script here, or describe your topic and hit "AI Enhance".\n\nSeparate scenes with a blank line — each paragraph becomes a segment.`}
          className="w-full min-h-[280px] resize-none rounded-2xl bg-secondary/30 border border-foreground/8 p-5 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
        />
      )}

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
        <span>{wordCount} words</span>
        {estSeconds > 0 && <span>≈ {estSeconds}s at 2.5 wps</span>}
        <span className="ml-auto">{script.length}/5000</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Media panel — internal logic unchanged
// ---------------------------------------------------------------------------

function MediaStep() {
  const { uploadedFiles, addFile, removeFile, stockQuery, setStockQuery, selectedStockClips, toggleStockClip } =
    useADKStore();
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const [stockResults, setStockResults] = useState<StockClip[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function processFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    for (const f of arr) {
      const tempId = Math.random().toString(36).slice(2);
      setUploading((p) => ({ ...p, [tempId]: true }));
      try {
        const result = await uploadADKFootage(f);
        const previewUrl = f.type.startsWith("video/") ? URL.createObjectURL(f) : undefined;
        addFile({ id: result.file_id, name: result.filename, sizeBytes: result.size_bytes, previewUrl });
        toast.success(`Uploaded ${f.name}`);
      } catch {
        toast.error(`Failed to upload ${f.name}`);
      } finally {
        setUploading((p) => { const n = { ...p }; delete n[tempId]; return n; });
      }
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    processFiles(e.dataTransfer.files);
  }

  useEffect(() => {
    if (!stockQuery.trim()) { setStockResults([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setStockLoading(true);
      try {
        const { videos } = await searchStockVideos(stockQuery);
        setStockResults(videos);
      } catch {
        toast.error("Stock search failed.");
      } finally {
        setStockLoading(false);
      }
    }, 600);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [stockQuery]);

  const pendingCount = Object.keys(uploading).length;

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 cursor-pointer transition-all",
          dragging ? "border-primary/60 bg-primary/5" : "border-foreground/10 hover:border-primary/30 hover:bg-secondary/20",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && processFiles(e.target.files)}
        />
        <Upload className="w-8 h-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-bold text-foreground/70">Drop B-roll footage here</p>
        <p className="text-xs text-muted-foreground/50 mt-1">MP4, MOV, WebM — up to 200 MB each</p>
      </div>

      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="flex justify-center"
          >
            <UploadLoader />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {uploadedFiles.map((f) => (
            <div key={f.id} className="relative group rounded-xl border border-foreground/8 bg-secondary/20 overflow-hidden">
              {f.previewUrl ? (
                <video src={f.previewUrl} className="w-full aspect-video object-cover" muted />
              ) : (
                <div className="w-full aspect-video bg-zinc-900 flex items-center justify-center">
                  <Film className="w-6 h-6 text-white/20" />
                </div>
              )}
              <div className="p-2">
                <p className="text-[11px] font-bold truncate text-foreground/80">{f.name}</p>
                <p className="text-[10px] text-muted-foreground/50">{(f.sizeBytes / 1e6).toFixed(1)} MB</p>
              </div>
              <button
                onClick={() => removeFile(f.id)}
                className="absolute top-2 right-2 p-1 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stock Explorer */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Stock Explorer</p>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
          <input
            value={stockQuery}
            onChange={(e) => setStockQuery(e.target.value)}
            placeholder="Search cinematic footage…"
            className="w-full rounded-xl bg-secondary/30 border border-foreground/8 pl-10 pr-4 py-3 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {stockLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary/60" />
          </div>
        )}

        {stockResults.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stockResults.map((clip) => {
              const selected = selectedStockClips.some((c) => c.id === clip.id);
              return (
                <button
                  key={clip.id}
                  onClick={() => toggleStockClip(clip)}
                  className={cn(
                    "relative rounded-xl overflow-hidden border-2 transition-all text-left",
                    selected ? "border-primary" : "border-transparent",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={clip.thumbnail} alt={clip.title} className="w-full aspect-video object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  {selected && (
                    <div className="absolute top-2 right-2 p-1 rounded-full bg-primary">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                  <p className="absolute bottom-2 left-2 text-[11px] font-bold text-white/80">{clip.duration}s</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Voice panel — internal logic unchanged
// ---------------------------------------------------------------------------

function VoiceStep() {
  const { voiceId, setVoiceId } = useADKStore();

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        AI Narrator
        <span className="ml-2 font-normal normal-case text-muted-foreground/50">
          (Google Cloud TTS)
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VOICES.map((v) => {
          const active = voiceId === v.id;
          return (
            <motion.button
              key={v.id}
              whileHover={{ y: -2, transition: { type: "spring", stiffness: 380, damping: 28 } }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setVoiceId(v.id)}
              className={cn(
                "relative rounded-2xl border p-5 text-left transition-[border-color,background-color,box-shadow] duration-[160ms]",
                active
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-foreground/8 bg-secondary/20 hover:border-primary/30 hover:bg-secondary/40",
              )}
            >
              {active && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20 }}
                  className="absolute top-3 right-3 p-1 rounded-full bg-primary"
                >
                  <Check className="w-2.5 h-2.5 text-white" />
                </motion.span>
              )}
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black transition-colors duration-[160ms]",
                  active ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
                )}>
                  {v.gender}
                </div>
                <div>
                  <p className="text-sm font-black">{v.name}</p>
                  <p className="text-[11px] text-muted-foreground/60">{v.tag}</p>
                </div>
              </div>
              <p className="text-[10px] font-mono text-muted-foreground/40 truncate">{v.id}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkspacePanel — accordion wrapper for the three creator modules
// ---------------------------------------------------------------------------

type PanelId = "media" | "script" | "voice";

interface WorkspacePanelProps {
  icon: React.ElementType;
  title: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function WorkspacePanel({ icon: Icon, title, badge, isOpen, onToggle, children }: WorkspacePanelProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border transition-[border-color,background-color] duration-200",
        isOpen
          ? "border-foreground/10 bg-secondary/10"
          : "border-foreground/6 bg-secondary/5",
      )}
    >
      {/* Panel header — always clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left group"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center transition-colors duration-200",
              isOpen
                ? "bg-primary/20 text-primary"
                : "bg-foreground/5 text-muted-foreground/50 group-hover:bg-primary/10 group-hover:text-primary/70",
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-black">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold text-muted-foreground/60 bg-foreground/6 rounded-full px-2 py-0.5 border border-foreground/6">
              {badge}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground/40 transition-transform" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground/40 transition-transform" />
        )}
      </button>

      {/* Animated panel body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-6 pt-1 border-t border-foreground/5">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page — non-linear creator workspace
// ---------------------------------------------------------------------------

export default function ADKPage() {
  const { data: session } = useSession();
  const store = useADKStore();

  // All three panels open by default — user can collapse any one
  const [openPanels, setOpenPanels] = useState<Set<PanelId>>(
    () => new Set<PanelId>(["media", "script", "voice"]),
  );

  // Render config — lives at page level (was inside old RenderStep)
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [aspect, setAspect] = useState<"9:16" | "1:1">("9:16");
  const [launching, setLaunching] = useState(false);

  // Realtime refs — logic unchanged from original wizard
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const togglePanel = useCallback((panel: PanelId) => {
    setOpenPanels((prev) => {
      const next = new Set(prev);
      if (next.has(panel)) next.delete(panel);
      else next.add(panel);
      return next;
    });
  }, []);

  const cleanupRealtime = useCallback(() => {
    channelRef.current?.unbind_all();
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => cleanupRealtime(), [cleanupRealtime]);

  function startPolling(jobId: string, userId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    const deadline = Date.now() + 10 * 60 * 1000;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await axios.get(`${API_URL}/api/status/${jobId}`, {
          params: { user_id: userId },
        });
        if (data.status === "finished" && data.download_url) {
          store.setProgress(100);
          store.setStatus("done");
          store.setDownloadUrl(data.download_url);
          cleanupRealtime();
        } else if (data.status === "failed") {
          store.setError(data.error ?? "Render failed");
          cleanupRealtime();
        } else if (Date.now() > deadline) {
          store.setError("Timed out after 10 minutes.");
          cleanupRealtime();
        }
      } catch { /* transient network errors — keep polling */ }
    }, 3000);
  }

  function subscribeRealtime(jobId: string, userId: string) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) { startPolling(jobId, userId); return; }

    if (!pusherRef.current) pusherRef.current = new Pusher(key, { cluster });
    const ch = pusherRef.current.subscribe(`export-${jobId}`);
    channelRef.current = ch;

    ch.bind("progress", (d: { progress?: number }) => {
      if (typeof d?.progress === "number") store.setProgress(Math.min(99, Math.round(d.progress)));
    });
    ch.bind("complete", (d: { download_url?: string }) => {
      if (d?.download_url) {
        store.setProgress(100);
        store.setStatus("done");
        store.setDownloadUrl(d.download_url);
        cleanupRealtime();
      } else {
        startPolling(jobId, userId);
      }
    });
    ch.bind("error", (d: { error?: string }) => {
      store.setError(d?.error ?? "Render failed");
      cleanupRealtime();
    });
    // Always also start polling as a safety net
    startPolling(jobId, userId);
  }

  // Payload builder — identical to original wizard's handleLaunch
  async function handleLaunch() {
    const userId = session?.user?.id ?? session?.user?.email ?? "anonymous";

    if (!store.script.trim()) {
      toast.error("Script is required — add one in the Script panel.");
      // Auto-expand the script panel so the user sees it immediately
      setOpenPanels((prev) => new Set([...prev, "script" as PanelId]));
      return;
    }

    setLaunching(true);
    store.setStatus("uploading");

    try {
      const result = await runADKGenerate({
        script: store.script,
        voice_id: store.voiceId,
        stock_query: store.stockQuery || undefined,
        uploaded_file_ids: store.uploadedFiles.map((f) => f.id),
        user_id: userId,
        aspect_ratio: aspect,
        quality,
      });

      store.setGenerateResult(result);
      toast.info("Short queued — rendering on the server…");
      subscribeRealtime(result.job_id, userId);
    } catch (err: unknown) {
      let msg = "Generation failed. Please try again.";
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          msg = "Sign in to use ADK Studio.";
        } else if (err.response?.status === 503) {
          msg = "Server is starting up — wait a moment and try again.";
        } else if (err.response?.data?.detail) {
          msg = String(err.response.data.detail);
        } else if (err.code === "ERR_NETWORK") {
          msg = "Could not reach the server — check your connection.";
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      store.setError(msg);
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }

  function handleDownload() {
    if (!store.downloadUrl) return;
    const abs = buildExportDownloadUrl(store.downloadUrl);
    const a = document.createElement("a");
    a.href = abs;
    a.download = "quickai-adk-short.mp4";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Minimum criteria: script has enough content OR footage has been provided.
  // Voice is always optional (default is pre-selected).
  const hasScript = store.script.trim().length >= 10;
  const hasMedia =
    store.uploadedFiles.length > 0 || store.selectedStockClips.length > 0;
  const canGenerate = hasScript || hasMedia;

  const isRunning =
    store.status === "queued" || store.status === "processing" || launching;
  const isDone = store.status === "done";
  const isError = store.status === "error";

  // Live badge values for each panel header
  const scriptBadge = store.script.trim()
    ? `${store.script.trim().split(/\s+/).length} words`
    : undefined;
  const mediaBadge =
    store.uploadedFiles.length + store.selectedStockClips.length > 0
      ? `${store.uploadedFiles.length + store.selectedStockClips.length} clips`
      : undefined;
  const voiceBadge = VOICES.find((v) => v.id === store.voiceId)?.name;

  return (
    /* Extra bottom padding so the sticky bar never overlaps content */
    <div className="max-w-3xl mx-auto py-8 px-4 pb-48">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden p-8 mb-6">
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, #1a0533 0%, #0a0a2e 25%, #001a33 50%, #0d1a00 75%, #1a0533 100%)",
            backgroundSize: "400% 400%",
          }}
          animate={{ backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"] }}
          transition={{ duration: 24, ease: "linear", repeat: Infinity }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">
              ADK Studio
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">
            Creator Workspace
          </h1>
          <p className="text-sm text-white/50 mt-2">
            Build your short in any order — script, footage, voice. Generate whenever you&apos;re ready.
          </p>
        </div>
      </div>

      {/* ── Three freely-navigable modules ──────────────────────────────────── */}
      <div className="space-y-3">
        <WorkspacePanel
          icon={Film}
          title="Media"
          badge={mediaBadge}
          isOpen={openPanels.has("media")}
          onToggle={() => togglePanel("media")}
        >
          <MediaStep />
        </WorkspacePanel>

        <WorkspacePanel
          icon={FileText}
          title="Script"
          badge={scriptBadge}
          isOpen={openPanels.has("script")}
          onToggle={() => togglePanel("script")}
        >
          <ScriptStep />
        </WorkspacePanel>

        <WorkspacePanel
          icon={Mic2}
          title="Voice"
          badge={voiceBadge}
          isOpen={openPanels.has("voice")}
          onToggle={() => togglePanel("voice")}
        >
          <VoiceStep />
        </WorkspacePanel>
      </div>

      {/* ── Sticky global generate bar ───────────────────────────────────────
           Activates the moment minimum criteria (script ≥10 words OR footage)
           are met. Lives outside the accordion so it is always reachable.
      ────────────────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-4 z-50 mt-6">
        <div className="rounded-2xl border border-foreground/10 bg-background/85 backdrop-blur-2xl p-4 shadow-2xl shadow-black/50 ring-1 ring-white/5">

          {/* Running indicator */}
          <AnimatePresence>
            {isRunning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-4 flex justify-center overflow-hidden"
              >
                <TimelineLoader
                  phases={[
                    "Scripting…",
                    "Designing…",
                    "Captioning…",
                    "Rendering…",
                    "Finishing…",
                  ]}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error state */}
          <AnimatePresence>
            {isError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                {store.errorMessage ?? "Render failed — please try again."}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Download CTA when render is complete */}
          <AnimatePresence>
            {isDone && store.downloadUrl && (
              <motion.button
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={handleDownload}
                className="w-full flex items-center justify-center gap-3 rounded-xl py-3.5 mb-3 text-sm font-black text-white shadow-xl shadow-emerald-500/20"
                style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
              >
                <Download className="w-5 h-5" />
                Download Short
              </motion.button>
            )}
          </AnimatePresence>

          {/* Controls row: quality · aspect · generate */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">

            {/* Quality picker */}
            <div className="flex gap-0.5 p-1 bg-secondary/50 rounded-xl border border-foreground/8 shrink-0">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setQuality(q.id as typeof quality)}
                  title={q.desc}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-black tracking-wide transition-all duration-150 whitespace-nowrap",
                    quality === q.id
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Aspect picker */}
            <div className="flex gap-0.5 p-1 bg-secondary/50 rounded-xl border border-foreground/8 shrink-0">
              {(["9:16", "1:1"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setAspect(r)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-black tracking-wide transition-all duration-150",
                    aspect === r
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Primary CTA — fills remaining width */}
            {!isDone ? (
              <button
                onClick={handleLaunch}
                disabled={!canGenerate || isRunning}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-black text-white transition-all duration-150 min-w-0",
                  canGenerate && !isRunning
                    ? "hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-primary/25"
                    : "opacity-40 cursor-not-allowed",
                )}
                style={{
                  background:
                    "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)",
                }}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span className="truncate">Processing…</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 shrink-0" />
                    <span className="truncate">Generate Short</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => store.reset()}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-muted-foreground border border-foreground/8 hover:bg-secondary/40 transition-colors"
              >
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span className="truncate">New Project</span>
              </button>
            )}
          </div>

          {/* Inline hint when nothing is ready yet */}
          <AnimatePresence>
            {!canGenerate && !isRunning && !isDone && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-2 text-center text-[11px] text-muted-foreground/40"
              >
                Add a script (10+ words) or upload footage to unlock generation
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
