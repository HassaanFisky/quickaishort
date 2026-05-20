"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import { Upload, Youtube, FileVideo, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditorStore } from "@/stores/editorStore";
import { toast } from "sonner";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";
import { InlineError } from "@/components/shared/InlineError";

export default function AcquirePanel() {
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [urlValidationError, setUrlValidationError] = useState<string | null>(null);
  const setSourceUrl = useEditorStore((state) => state.setSourceUrl);
  const setSourceFile = useEditorStore((state) => state.setSourceFile);
  const sourceFile = useEditorStore((state) => state.sourceFile);
  const currentStage = useEditorStore((state) => state.currentStage);
  const { runPipeline } = useMediaPipeline();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file && file.type.startsWith("video/")) {
        setSourceFile(file);
        toast.success("Video uploaded successfully");
      } else {
        toast.error("Please upload a valid video file");
      }
    },
    [setSourceFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [] },
    multiple: false,
  });

  const YT_PATTERN =
    /^https?:\/\/(www\.)?(youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)[A-Za-z0-9_-]{11}/;

  // Derived state: is the current URL a well-formed YouTube link?
  // Used to render the right-edge validation icon and to gate submission.
  const urlIsValid = useMemo(() => {
    if (!url.trim()) return false;
    return YT_PATTERN.test(url.trim());
  }, [url]);

  const isYtActive = useMemo(() => {
    return url.trim().length > 0;
  }, [url]);

  const handleUrlChange = (next: string) => {
    setUrl(next);
    // Clear any stale validation error as soon as the user edits the field.
    if (urlValidationError) setUrlValidationError(null);
  };

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    if (!urlIsValid) {
      setUrlValidationError(
        "That doesn't look like a YouTube link. Try the full URL from your browser address bar — for example youtube.com/watch?v=... or youtu.be/...",
      );
      return;
    }

    setUrlValidationError(null);

    try {
      setIsImporting(true);
      toast.loading("Fetching video metadata...", { id: "import-video" });

      const { getVideoInfo } = await import("@/lib/api");
      const info = await getVideoInfo(url);

      if (info) {
        // Enforce the strict 30-minute duration limit
        if (info.duration > 1800) {
          toast.error("Videos longer than 30 minutes are not supported. Please select a shorter video.", { id: "import-video" });
          setUrlValidationError("Videos longer than 30 minutes are not supported. Choose a video under 30 minutes.");
          setIsImporting(false);
          return;
        }

        setSourceUrl(url); // Store original URL

        // Update store with metadata
        useEditorStore.setState({
          duration: info.duration,
          // We can't set sourceFile for URLs, but the store handles sourceUrl
        });

        toast.success("Video imported successfully!", { id: "import-video" });
        runPipeline();
      }
    } catch (err: any) {
      console.error("Import error:", err);
      toast.error(err.response?.data?.detail || "Failed to import video", { id: "import-video" });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <AnimatePresence initial={false}>
        {!isYtActive && (
          <motion.div
            initial={{ opacity: 1, height: "auto" }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0, overflow: "hidden", marginBottom: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="space-y-6"
          >
            <div
              {...getRootProps()}
              className={cn(
                "relative border-2 border-dashed rounded-2xl p-8 transition-all duration-300 cursor-pointer group",
                isDragActive
                  ? "border-primary bg-primary/5 scale-[0.98]"
                  : "border-muted-foreground/20 hover:border-primary/50 hover:bg-accent/50",
                sourceFile && "border-green-500/50 bg-green-500/5",
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center text-center gap-4">
                <motion.div
                  animate={isDragActive ? { scale: 1.15 } : { scale: 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24 }}
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center",
                    sourceFile
                      ? "bg-green-500/10 text-green-500"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  <AnimatePresence mode="wait">
                    {sourceFile ? (
                      <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                        <CheckCircle2 className="w-8 h-8" />
                      </motion.div>
                    ) : (
                      <motion.div key="upload" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 20 }}>
                        <Upload className="w-8 h-8" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
                <div>
                  <p className="font-semibold text-lg">
                    {sourceFile
                      ? sourceFile.name
                      : isDragActive
                        ? "Drop video here"
                        : "Click or drag video"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1 text-balance">
                    MP4, MOV, WebM or AVI. Max 500MB recommended for browser
                    performance.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or import from URL
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.form
        layout
        onSubmit={handleUrlSubmit}
        className="space-y-4"
        aria-describedby={urlValidationError ? "acquire-url-error" : undefined}
        noValidate
      >
        <motion.div layout className={cn("relative flex-1", isYtActive && "neon-url-container p-[2px] bg-card/40 rounded-2xl shadow-[0_0_30px_rgba(168,85,247,0.15)]")}>
          {isYtActive && (
            <>
              <div className="neon-url-spin-layer" />
              <div className="neon-url-glow-layer" />
            </>
          )}
          <div className={cn("relative flex-1", isYtActive && "neon-url-inner")}>
            <Youtube
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10"
              aria-hidden="true"
            />
            <Input
              placeholder="Paste YouTube URL"
              className={cn(
                "pl-12 bg-background/50 border-foreground/10 focus-visible:ring-primary/40",
                urlIsValid && "pr-12",
                urlValidationError && "border-destructive/60 focus-visible:ring-destructive/40",
                isYtActive && "h-14 font-medium text-base rounded-2xl border-none pl-14"
              )}
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={isImporting}
              aria-invalid={Boolean(urlValidationError)}
              aria-label="YouTube video URL"
            />
            <AnimatePresence>
              {urlIsValid && !urlValidationError && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10"
                >
                  <CheckCircle2 aria-hidden="true" className="w-5 h-5 text-emerald-500" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {isYtActive ? (
            <motion.div
              key="large-btn"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="flex justify-center"
            >
              <Button
                type="submit"
                disabled={isImporting || !url}
                className={cn(
                  "w-full h-12 text-sm font-black uppercase tracking-widest bg-gradient-to-r from-primary to-pink-500 hover:brightness-110 active:scale-98 transition-all rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.3)]",
                  isImporting && "from-purple-800 to-pink-800"
                )}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Video stream...
                  </>
                ) : (
                  "✦ Analyze & Generate Shorts"
                )}
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {urlValidationError && (
          <div id="acquire-url-error">
            <InlineError title="Check that URL" body={urlValidationError} />
          </div>
        )}
      </motion.form>

      {sourceFile && (
        <div className="bg-accent/50 p-4 rounded-xl flex items-center gap-4 border border-primary/20 animate-in zoom-in-95 duration-300">
          <div className="bg-primary/10 p-2 rounded-lg text-primary">
            <FileVideo className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{sourceFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(sourceFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={runPipeline}
            disabled={currentStage !== "loading" && currentStage !== "idle"}
          >
            {currentStage === "idle" || currentStage === "loading"
              ? "Analyze"
              : "Processing..."}
          </Button>
        </div>
      )}
    </div>
  );
}
