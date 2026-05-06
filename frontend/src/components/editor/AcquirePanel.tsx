"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, Youtube, FileVideo, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEditorStore } from "@/stores/editorStore";
import { toast } from "sonner";
import { useMediaPipeline } from "@/hooks/useMediaPipeline";

export default function AcquirePanel() {
  const [url, setUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);
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
    /^https?:\/\/(www\.)?(youtube\.com\/watch\?.*v=|youtu\.be\/)[A-Za-z0-9_-]{11}/;

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    if (!YT_PATTERN.test(url.trim())) {
      toast.error(
        "Please paste a YouTube URL — e.g. youtube.com/watch?v=... or youtu.be/...",
      );
      return;
    }

    try {
      setIsImporting(true);
      toast.loading("Fetching video metadata...", { id: "import-video" });
      
      const { getVideoInfo, getProxyUrl } = await import("@/lib/api");
      const info = await getVideoInfo(url);
      
      if (info) {
        setSourceUrl(url); // Store original URL
        // We use the proxy URL for the video element to avoid CORS issues
        const proxyUrl = getProxyUrl(url);
        
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
          <div
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
              sourceFile
                ? "bg-green-500/10 text-green-500"
                : "bg-primary/10 text-primary",
            )}
          >
            {sourceFile ? (
              <CheckCircle2 className="w-8 h-8" />
            ) : (
              <Upload className="w-8 h-8" />
            )}
          </div>
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

      <form onSubmit={handleUrlSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Paste YouTube or Video URL"
            className="pl-10"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isImporting}
          />
        </div>
        <Button type="submit" disabled={isImporting || !url}>
          {isImporting ? "Importing..." : "Import"}
        </Button>
      </form>

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
