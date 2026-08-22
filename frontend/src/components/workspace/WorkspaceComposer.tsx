"use client";

import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  FileVideo,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  acceptAttrFromPolicy,
  fetchIngestPolicy,
  FALLBACK_INGEST_POLICY,
  validateFileAgainstPolicy,
  type MediaIngestPolicy,
} from "@/lib/studio/ingestPolicy";
import { parseYouTubeId } from "@/lib/youtube-utils";
import { isDirectVideoUrl } from "@/lib/studio/ingestFsm";
import { LOOP_COPY } from "@/lib/studio/computePlane";

const PROMPT_SUGGESTIONS = [
  "Find 3 high-retention hooks under 60 seconds",
  "Cut filler and keep the strongest moments",
  "Add captions and export vertical shorts",
];

export type AttachedFileStatus = "pending" | "uploading" | "ready" | "failed";

export interface AttachedFile {
  id: string;
  file: File;
  status: AttachedFileStatus;
  error?: string;
  durationLabel?: string;
}

export interface WorkspaceComposerSubmit {
  prompt: string;
  url?: string;
  files: AttachedFile[];
}

interface WorkspaceComposerProps {
  disabled?: boolean;
  busy?: boolean;
  uploadProgress?: number | null;
  activeFileIndex?: number;
  totalFiles?: number;
  onSubmit: (payload: WorkspaceComposerSubmit) => void;
  onCancel?: () => void;
  className?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function probeDuration(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const sec = Math.round(video.duration);
      URL.revokeObjectURL(url);
      if (!Number.isFinite(sec) || sec <= 0) {
        resolve(undefined);
        return;
      }
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      resolve(m > 0 ? `${m}m ${s}s` : `${s}s`);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    video.src = url;
  });
}

export function WorkspaceComposer({
  disabled = false,
  busy = false,
  uploadProgress = null,
  activeFileIndex,
  totalFiles,
  onSubmit,
  onCancel,
  className,
}: WorkspaceComposerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [policy, setPolicy] = useState<MediaIngestPolicy>(FALLBACK_INGEST_POLICY);
  const [prompt, setPrompt] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlValid, setUrlValid] = useState<boolean | null>(null);
  const [attached, setAttached] = useState<AttachedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void fetchIngestPolicy().then(setPolicy);
  }, []);

  const validateUrl = useCallback((val: string) => {
    if (!val.trim()) {
      setUrlValid(null);
      return;
    }
    if (parseYouTubeId(val) || isDirectVideoUrl(val)) {
      setUrlValid(true);
    } else {
      setUrlValid(false);
    }
  }, []);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      setLocalError(null);
      const list = Array.from(files);
      const next: AttachedFile[] = [];

      for (const file of list) {
        const v = validateFileAgainstPolicy(file, policy);
        if (!v.ok) {
          setLocalError(v.message);
          continue;
        }
        const durationLabel = await probeDuration(file);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          status: "ready",
          durationLabel,
        });
      }

      if (next.length) {
        setAttached((prev) => [...prev, ...next]);
      }
    },
    [policy],
  );

  const removeFile = (id: string) => {
    setAttached((prev) => prev.filter((f) => f.id !== id));
  };

  const retryFile = (id: string) => {
    setAttached((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "ready", error: undefined } : f)),
    );
    setLocalError(null);
  };

  const onFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.files;
    if (items?.length) {
      e.preventDefault();
      void addFiles(items);
    }
  };

  const handleSend = () => {
    setLocalError(null);
    const trimmedPrompt = prompt.trim();
    const trimmedUrl = urlInput.trim();

    if (!trimmedUrl && attached.length === 0) {
      setLocalError("Add a video file or paste a link to get started.");
      return;
    }

    if (trimmedUrl && urlValid === false) {
      setLocalError("That link isn't supported. Use YouTube or a direct video URL.");
      return;
    }

    onSubmit({
      prompt: trimmedPrompt,
      url: trimmedUrl || undefined,
      files: attached,
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !busy) handleSend();
    }
  };

  const canSend =
    !disabled &&
    !busy &&
    (attached.length > 0 || (urlInput.trim() && urlValid !== false));

  const progressLabel =
    uploadProgress != null && activeFileIndex != null && totalFiles != null && totalFiles > 1
      ? `Uploading ${activeFileIndex} of ${totalFiles} files`
      : uploadProgress != null
        ? `Uploading… ${uploadProgress}%`
        : busy
          ? "Processing your footage…"
          : null;

  return (
    <div
      className={cn(
        "w-full max-w-2xl mx-auto flex flex-col gap-4",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileRef}
        type="file"
        accept={acceptAttrFromPolicy(policy)}
        multiple
        className="sr-only"
        onChange={onFileInput}
        aria-hidden
        tabIndex={-1}
      />

      <div
        className={cn(
          "rounded-2xl border bg-[hsl(var(--bg-subtle))] transition-colors",
          dragOver ? "border-[hsl(var(--accent-indigo))]/50" : "border-border",
        )}
      >
        <div className="p-3 sm:p-4 border-b border-border/70">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || busy}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-xl border border-dashed py-6",
              "text-sm font-medium text-[hsl(var(--fg-muted))]",
              "hover:border-[hsl(var(--accent-indigo))]/40 hover:bg-[hsl(var(--bg-muted))]/40",
              "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <Upload className="w-4 h-4 text-[hsl(var(--accent-indigo))]" aria-hidden />
            Upload video files
            <span className="text-[hsl(var(--fg-subtle))] font-normal">or drag and drop</span>
          </button>
          <p className="mt-2 text-center text-[12px] text-[hsl(var(--fg-subtle))]">
            {policy.examples_label}
          </p>
        </div>

        <AnimatePresence initial={false}>
          {attached.length > 0 && (
            <motion.ul
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="divide-y divide-border/60 overflow-hidden"
              aria-label="Attached files"
            >
              {attached.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2.5 sm:px-4 text-[13px]"
                >
                  <FileVideo className="w-4 h-4 shrink-0 text-[hsl(var(--fg-subtle))]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[hsl(var(--fg))]">{item.file.name}</p>
                    <p className="text-[11px] text-[hsl(var(--fg-subtle))]">
                      {item.file.type || "video"} · {formatBytes(item.file.size)}
                      {item.durationLabel ? ` · ${item.durationLabel}` : ""}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-medium capitalize shrink-0",
                      item.status === "ready" && "text-emerald-400",
                      item.status === "failed" && "text-red-400",
                      item.status === "uploading" && "text-amber-300",
                      item.status === "pending" && "text-[hsl(var(--fg-subtle))]",
                    )}
                  >
                    {item.status === "ready" ? LOOP_COPY.fileReady : item.status}
                  </span>
                  {item.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => retryFile(item.id)}
                      className="p-1 text-[hsl(var(--fg-subtle))] hover:text-[hsl(var(--fg))]"
                      aria-label={`Retry ${item.file.name}`}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!busy && (
                    <button
                      type="button"
                      onClick={() => removeFile(item.id)}
                      className="p-1 text-[hsl(var(--fg-subtle))] hover:text-[hsl(var(--fg))]"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>

        <div className="p-3 sm:p-4 space-y-3">
          <label className="sr-only" htmlFor="workspace-url">
            Video link
          </label>
          <input
            id="workspace-url"
            type="url"
            value={urlInput}
            onChange={(e) => {
              setUrlInput(e.target.value);
              validateUrl(e.target.value);
            }}
            placeholder="Or paste a YouTube or video link"
            disabled={disabled || busy}
            className={cn(
              "w-full h-10 px-3 rounded-xl bg-[hsl(var(--bg-muted))]/50 border text-[13px]",
              "placeholder:text-[hsl(var(--fg-subtle))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-indigo))]/30",
              urlValid === false ? "border-red-500/40" : "border-border",
            )}
          />

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            disabled={disabled || busy}
            rows={3}
            placeholder="Describe the shorts you want — hooks, length, style…"
            className={cn(
              "w-full resize-none rounded-xl px-3 py-2.5 text-[13px] leading-relaxed",
              "bg-[hsl(var(--bg-muted))]/50 border border-border text-[hsl(var(--fg))]",
              "placeholder:text-[hsl(var(--fg-subtle))]",
              "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--accent-indigo))]/30",
            )}
          />

          <div className="flex flex-wrap gap-1.5">
            {PROMPT_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={disabled || busy}
                onClick={() => setPrompt(s)}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-border/80 text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))] hover:border-[hsl(var(--accent-indigo))]/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>

          {(localError || progressLabel) && (
            <div className="space-y-2">
              {progressLabel && (
                <div
                  className="flex items-center gap-2 text-[12px] text-[hsl(var(--fg-muted))]"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
                  {progressLabel}
                  {onCancel && busy && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="ml-auto text-[11px] font-medium text-red-400 hover:text-red-300"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              )}
              {localError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 text-[12px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  <span>{localError}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled || busy}
              className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))] hover:bg-[hsl(var(--bg-muted))]/50 disabled:opacity-50"
              aria-label="Attach video files"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={cn(
                "ml-auto h-9 px-4 rounded-lg flex items-center gap-2 text-[13px] font-medium",
                "bg-[hsl(var(--accent-indigo))] text-[hsl(var(--accent-fg))]",
                "hover:bg-[hsl(var(--accent-hover))] transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              <Send className="w-3.5 h-3.5" aria-hidden />
              Start editing
            </button>
          </div>
        </div>
      </div>

      <p className="text-center text-[13px] text-[hsl(var(--fg-subtle))] leading-relaxed">
        {LOOP_COPY.ingestLocalHint}
      </p>
    </div>
  );
}
