"use client";

import React, { useState, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useTimelineStore } from "@/lib/editor/timeline-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  Settings,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

export function ExportModal() {
  const { clips, projectTitle } = useTimelineStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [resolution, setResolution] = useState("1080");
  const [aspectRatio, setAspectRatio] = useState("9:16");

  const ffmpegRef = useRef<FFmpeg | null>(null);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${baseURL}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });

    ffmpeg.on("progress", ({ progress: p }) => {
      setProgress(Math.round(p * 100));
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const generateExport = async () => {
    if (clips.length === 0) return;

    setIsProcessing(true);
    setIsComplete(false);
    setError("");
    setStatus("Initializing FFmpeg Engine...");

    try {
      const ffmpeg = await loadFFmpeg();

      setStatus("Downloading Source Assets...");
      const uniqueSourceUrls = Array.from(
        new Set(clips.map((c) => c.videoUrl)),
      );

      for (let i = 0; i < uniqueSourceUrls.length; i++) {
        const url = uniqueSourceUrls[i];
        const filename = `input_${i}.mp4`;
        await ffmpeg.writeFile(filename, await fetchFile(url));
      }

      setStatus("Encoding Video (Client-Side)...");

      let filterComplex = "";
      clips.forEach((clip, i) => {
        const sourceIdx = uniqueSourceUrls.indexOf(clip.videoUrl);
        filterComplex += `[${sourceIdx}:v]trim=start=${clip.trimIn}:end=${clip.trimOut},setpts=PTS-STARTPTS[v${i}];`;
        filterComplex += `[${sourceIdx}:a]atrim=start=${clip.trimIn}:end=${clip.trimOut},asetpts=PTS-STARTPTS[a${i}];`;
      });

      const concatInputs = clips.map((_, i) => `[v${i}][a${i}]`).join("");
      filterComplex += `${concatInputs}concat=n=${clips.length}:v=1:a=1[outv][outa]`;

      const args = [
        ...uniqueSourceUrls.map((_, i) => ["-i", `input_${i}.mp4`]).flat(),
        "-filter_complex",
        filterComplex,
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "output.mp4",
      ];

      await ffmpeg.exec(args);

      const data = await ffmpeg.readFile("output.mp4");
      const blob = new Blob([data as unknown as BlobPart], {
        type: "video/mp4",
      });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${projectTitle.replace(/\s+/g, "_")}_export.mp4`;
      a.click();

      setIsComplete(true);
      setStatus("Export Successful!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      console.error(err);
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-2 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40"
        >
          <Download size={16} /> Export
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-neutral-900 border-neutral-800 text-white p-0 overflow-hidden">
        <div className="p-6 relative">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <Settings className="text-neutral-500" size={24} /> Export Project
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Your video will be processed locally in your browser.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Resolution
                </label>
                <select
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  className="w-full h-10 bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-sm"
                >
                  <option value="1080">1080p (Full HD)</option>
                  <option value="720">720p (HD)</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full h-10 bg-neutral-950 border border-neutral-800 rounded-lg px-3 text-sm"
                >
                  <option value="9:16">9:16 (Shorts)</option>
                  <option value="16:9">16:9 (YouTube)</option>
                  <option value="1:1">1:1 (Instagram)</option>
                </select>
              </div>
            </div>

            {isProcessing && (
              <div className="space-y-3 p-4 bg-black/40 rounded-xl border border-neutral-800 animate-in fade-in">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-blue-400 font-medium flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> {status}
                  </span>
                  <span className="font-mono">{progress}%</span>
                </div>
                <div className="w-full bg-neutral-800 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {isComplete && (
              <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400">
                <CheckCircle2 size={24} />
                <div>
                  <p className="font-bold">Export Ready</p>
                  <p className="text-xs opacity-70">
                    The file has been downloaded.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
                <AlertCircle size={24} />
                <p className="text-xs">{error}</p>
              </div>
            )}
          </div>

          <DialogFooter className="mt-8">
            <Button
              className="bg-blue-600 hover:bg-blue-500 text-white px-8"
              onClick={generateExport}
              disabled={isProcessing || isComplete || clips.length === 0}
            >
              {isProcessing ? "Processing..." : "Start Export"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
