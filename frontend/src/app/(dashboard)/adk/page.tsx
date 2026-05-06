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
  ChevronRight,
  ChevronLeft,
  Wand2,
  Upload,
  X,
  Search,
  Check,
  Loader2,
  Download,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

const STEPS = [
  { label: "Script", icon: FileText, desc: "Write or generate your script" },
  { label: "Media", icon: Film, desc: "Upload footage & find stock clips" },
  { label: "Voice", icon: Mic2, desc: "Choose your AI narrator" },
  { label: "Render", icon: Rocket, desc: "Configure & launch" },
] as const;

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
// Step 0 — Script
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
    } catch {
      toast.error("AI generation failed. Check your credits or try again.");
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

      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder={`Write your short's script here, or describe your topic and hit "AI Enhance".\n\nSeparate scenes with a blank line — each paragraph becomes a segment.`}
        className="w-full min-h-[280px] resize-none rounded-2xl bg-secondary/30 border border-foreground/8 p-5 text-sm leading-relaxed placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40 transition-colors"
      />

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
        <span>{wordCount} words</span>
        {estSeconds > 0 && <span>≈ {estSeconds}s at 2.5 wps</span>}
        <span className="ml-auto">{script.length}/5000</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Media
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
        {pendingCount > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-primary">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading {pendingCount} file{pendingCount > 1 ? "s" : ""}…
          </div>
        )}
      </div>

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
            placeholder="Search cinematic footage… (requires PEXELS_API_KEY)"
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
// Step 2 — Voice
// ---------------------------------------------------------------------------

function VoiceStep() {
  const { voiceId, setVoiceId } = useADKStore();

  return (
    <div className="space-y-4">
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        AI Narrator
        <span className="ml-2 font-normal normal-case text-muted-foreground/50">
          (Google Cloud TTS — requires GOOGLE_TTS_API_KEY)
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {VOICES.map((v) => {
          const active = voiceId === v.id;
          return (
            <button
              key={v.id}
              onClick={() => setVoiceId(v.id)}
              className={cn(
                "relative rounded-2xl border p-5 text-left transition-all",
                active
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-foreground/8 bg-secondary/20 hover:border-primary/30 hover:bg-secondary/40",
              )}
            >
              {active && (
                <span className="absolute top-3 right-3 p-1 rounded-full bg-primary">
                  <Check className="w-2.5 h-2.5 text-white" />
                </span>
              )}
              <div className="flex items-center gap-3 mb-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black",
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Render
// ---------------------------------------------------------------------------

function RenderStep({
  onLaunch,
  launching,
}: {
  onLaunch: (quality: "low" | "medium" | "high", aspect: "9:16" | "1:1") => void;
  launching: boolean;
}) {
  const {
    script, uploadedFiles, selectedStockClips, voiceId, status, progress, downloadUrl, errorMessage,
    step, setStep,
  } = useADKStore();
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [aspect, setAspect] = useState<"9:16" | "1:1">("9:16");

  const store = useADKStore();

  const wordCount = script.trim().split(/\s+/).filter(Boolean).length;
  const selectedVoice = VOICES.find((v) => v.id === voiceId);

  const isDone = status === "done";
  const isError = status === "error";
  const isRunning = status === "queued" || status === "processing" || launching;

  function handleDownload() {
    if (!downloadUrl) return;
    const abs = buildExportDownloadUrl(downloadUrl);
    const a = document.createElement("a");
    a.href = abs;
    a.download = `quickai-adk-short.mp4`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-2xl border border-foreground/8 bg-secondary/20 divide-y divide-foreground/5">
        {[
          { label: "Script", value: `${wordCount} words · ${script.split("\n\n").filter(Boolean).length} segments` },
          { label: "Media", value: `${uploadedFiles.length} uploads · ${selectedStockClips.length} stock clips` },
          { label: "Voice", value: selectedVoice ? `${selectedVoice.name} (${selectedVoice.tag})` : voiceId },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between px-5 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60">{label}</span>
            <span className="text-sm font-bold">{value}</span>
          </div>
        ))}
      </div>

      {/* Quality */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Quality</p>
        <div className="grid grid-cols-3 gap-3">
          {QUALITY_OPTIONS.map((q) => (
            <button
              key={q.id}
              onClick={() => setQuality(q.id as typeof quality)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                quality === q.id
                  ? "border-primary bg-primary/10"
                  : "border-foreground/8 bg-secondary/20 hover:border-primary/30",
              )}
            >
              <p className="text-sm font-black">{q.label}</p>
              <p className="text-[11px] text-muted-foreground/60">{q.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Aspect Ratio</p>
        <div className="flex gap-3">
          {(["9:16", "1:1"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setAspect(r)}
              className={cn(
                "rounded-xl border px-5 py-3 text-sm font-black transition-all",
                aspect === r
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-foreground/8 bg-secondary/20 hover:border-primary/30",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Progress / Result */}
      {isRunning && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground/60">
            <span>Rendering…</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
              animate={{ width: `${Math.max(progress, 5)}%` }}
              transition={{ ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {isDone && downloadUrl && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-sm font-black text-white shadow-2xl shadow-emerald-500/20"
          style={{ background: "linear-gradient(135deg, #10b981, #06b6d4)" }}
        >
          <Download className="w-5 h-5" />
          Download Short
        </motion.button>
      )}

      {isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {errorMessage ?? "Render failed. Please try again."}
        </div>
      )}

      {/* Launch */}
      {!isDone && (
        <button
          onClick={() => onLaunch(quality, aspect)}
          disabled={isRunning}
          className={cn(
            "w-full flex items-center justify-center gap-3 rounded-2xl py-4 text-sm font-black text-white transition-all shadow-2xl shadow-primary/20",
            isRunning ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.01] active:scale-[0.99]",
          )}
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #a855f7 60%, #ec4899 100%)" }}
        >
          {isRunning ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Processing…</>
          ) : (
            <><Rocket className="w-5 h-5" /> Generate Short</>
          )}
        </button>
      )}

      {isDone && (
        <button
          onClick={() => store.reset()}
          className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-muted-foreground border border-foreground/8 hover:bg-secondary/40 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Start New Project
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ADKPage() {
  const { data: session } = useSession();
  const store = useADKStore();

  // Pusher subscription ref
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [launching, setLaunching] = useState(false);

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
        const { data } = await axios.get(`${API_URL}/api/status/${jobId}`, { params: { user_id: userId } });
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
      } catch { /* ignore */ }
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
    startPolling(jobId, userId);
  }

  async function handleLaunch(
    quality: "low" | "medium" | "high",
    aspect: "9:16" | "1:1",
  ) {

    const userId = session?.user?.id ?? session?.user?.email ?? "anonymous";
    if (!store.script.trim()) { toast.error("Script is required."); store.setStep(0); return; }

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
      const msg = err instanceof Error ? err.message : "Generation failed";
      store.setError(msg);
      toast.error(msg);
    } finally {
      setLaunching(false);
    }
  }

  const canNext =
    store.step === 0 ? store.script.trim().length >= 10 :
    store.step === 1 ? true :
    store.step === 2 ? true : false;

  return (
    <div className="max-w-3xl mx-auto space-y-10 py-8 px-4">
      {/* Header with animated hue gradient */}
      <div className="relative rounded-3xl overflow-hidden p-8">
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
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-primary">ADK Studio</span>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-white">
            AI Short Generator
          </h1>
          <p className="text-sm text-white/50 mt-2">
            Script → Footage → Voice → Render. Your short, fully orchestrated.
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < store.step;
          const active = i === store.step;
          return (
            <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
              <button
                onClick={() => done && store.setStep(i as 0 | 1 | 2 | 3)}
                disabled={!done}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all whitespace-nowrap",
                  active ? "bg-primary/15 text-primary border border-primary/30" :
                  done ? "text-primary/60 hover:text-primary cursor-pointer" :
                  "text-muted-foreground/30 cursor-default",
                )}
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                  active ? "bg-primary text-white" :
                  done ? "bg-primary/20 text-primary" : "bg-foreground/5 text-muted-foreground/30",
                )}>
                  {done ? <Check className="w-3 h-3" /> : <Icon className="w-3 h-3" />}
                </div>
                <span className="hidden sm:block">{s.label}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={cn("flex-1 h-px", i < store.step ? "bg-primary/30" : "bg-foreground/8")} />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="relative min-h-[340px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={store.step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {store.step === 0 && <ScriptStep />}
            {store.step === 1 && <MediaStep />}
            {store.step === 2 && <VoiceStep />}
            {store.step === 3 && <RenderStep onLaunch={handleLaunch} launching={launching} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      {store.step < 3 && (
        <div className="flex items-center justify-between pt-4 border-t border-foreground/5">
          <button
            onClick={() => store.step > 0 && store.setStep((store.step - 1) as 0 | 1 | 2 | 3)}
            disabled={store.step === 0}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-muted-foreground border border-foreground/8 hover:bg-secondary/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={() => store.setStep((store.step + 1) as 1 | 2 | 3)}
            disabled={!canNext}
            className={cn(
              "flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-white transition-all shadow-lg shadow-primary/20",
              canNext ? "hover:scale-[1.02] active:scale-[0.98]" : "opacity-40 cursor-not-allowed",
            )}
            style={{ background: "linear-gradient(135deg, #a855f7, #ec4899)" }}
          >
            {store.step === 2 ? "Go to Render" : "Next"}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Back from render step */}
      {store.step === 3 && store.status === "idle" && (
        <div className="flex pt-4 border-t border-foreground/5">
          <button
            onClick={() => store.setStep(2)}
            className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-muted-foreground border border-foreground/8 hover:bg-secondary/40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      )}
    </div>
  );
}
