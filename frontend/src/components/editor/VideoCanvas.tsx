"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  PlayCircle,
  Loader2,
  AlertCircle,
  Scissors,
  Flag,
  Maximize2,
  Volume2,
  VolumeX,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editorStore";
import { API_URL } from "@/lib/api";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { CaptionOverlay } from "./CaptionOverlay";
import { CanvasLayer } from "./CanvasLayer";
import { InteractiveCanvas } from "./InteractiveCanvas";
import { useAIPanel } from "@/stores/aiPanelStore";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/utils/formatTime";

declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, number | string>;
          events?: { onReady?: (e: { target: YTPlayer }) => void };
        }
      ) => YTPlayer;
      loaded?: number;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  getCurrentTime(): number;
  destroy(): void;
}

function extractYtVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export default function VideoCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseFilterRef = useRef<BiquadFilterNode | null>(null);

  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [proxyRetry, setProxyRetry] = useState(0);
  const [localYtId, setLocalYtId] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const ytPlayerRef = useRef<YTPlayer | null>(null);

  const {
    sourceUrl,
    thumbnailUrl,
    selectedClipId,
    suggestions,
    transcript,
    captionsEnabled,
    duration,
    currentTime,
    isPlaying,
    pendingSeek,
    exportSettings,
    videoMetadata,
    setCurrentTime,
    setIsPlaying,
    setDuration,
    clearPendingSeek,
    setYtVideoId,
    setClipRange,
    setVideoMetadata,
    compiledManifest,
    timelineRevision,
  } = useEditorStore();

  const { isReady, reframingData, detect } = useFaceTracker();
  const { executionOverlay, executionOverlayLabel } = useAIPanel();
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  // RenderManifest is prepared here for preview/export parity; existing preview path stays unchanged in Phase 51.
  const latestManifestRef = useRef(compiledManifest);
  useEffect(() => {
    latestManifestRef.current = compiledManifest;
  }, [timelineRevision, compiledManifest]);

  // Web Audio API chain — MediaElementSource → BiquadFilter → GainNode
  useEffect(() => {
    if (!videoRef.current) return;
    const audioBoost = exportSettings.audioBoost;
    if (!audioContextRef.current) {
      try {
        const AudioCtx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioContextRef.current = new AudioCtx();
        const source = audioContextRef.current.createMediaElementSource(videoRef.current);
        noiseFilterRef.current = audioContextRef.current.createBiquadFilter();
        noiseFilterRef.current.type = "highpass";
        noiseFilterRef.current.frequency.value = 80;
        gainNodeRef.current = audioContextRef.current.createGain();
        source.connect(noiseFilterRef.current);
        noiseFilterRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContextRef.current.destination);
      } catch {
        audioContextRef.current = null;
      }
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = (audioBoost / 100) * 1.5;
    } else if (videoRef.current) {
      videoRef.current.volume = Math.min(1, audioBoost / 100);
    }
    if (isPlaying && audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [exportSettings.audioBoost, isPlaying]);

  // Live noise suppression — update highpass filter frequency
  useEffect(() => {
    if (!noiseFilterRef.current) return;
    noiseFilterRef.current.frequency.value = 80 + (exportSettings.noiseSuppression / 100) * 320;
  }, [exportSettings.noiseSuppression]);

  // Live playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = exportSettings.playbackSpeed / 100;
    }
  }, [exportSettings.playbackSpeed, displayUrl]);

  const getCssFilter = () => {
    const filter = exportSettings.filter;
    if (filter === "Urban") return "contrast(1.2) saturate(0.9)";
    if (filter === "Retro") return "sepia(0.4) contrast(1.1) brightness(0.95)";
    if (filter === "Cinematic") return "contrast(1.15) brightness(0.9) saturate(1.1)";
    return "none";
  };

  useEffect(() => {
    if (!sourceUrl) {
      setDisplayUrl(null);
      setVideoError(false);
      setYtVideoId(null);
      return;
    }
    setVideoError(false);
    setProxyRetry(0);
    const ytId = extractYtVideoId(sourceUrl);
    if (ytId) {
      setYtVideoId(ytId);
      if (duration <= 1800) {
        setLocalYtId(null);
        setDisplayUrl(`${API_URL}/api/proxy-video?url=${encodeURIComponent(sourceUrl)}`);
      } else {
        setLocalYtId(ytId);
        setDisplayUrl(null);
      }
    } else {
      setLocalYtId(null);
      setYtVideoId(null);
      setDisplayUrl(sourceUrl);
    }
  }, [sourceUrl, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // IFrame fallback timeout
  useEffect(() => {
    if (!displayUrl || localYtId) return;
    const timer = setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState < 2) {
        const ytId = sourceUrl ? extractYtVideoId(sourceUrl) : null;
        if (ytId) {
          setLocalYtId(ytId);
          setDisplayUrl(null);
          setProxyRetry(0);
        }
      }
    }, 10_000);
    return () => clearTimeout(timer);
  }, [displayUrl, localYtId, sourceUrl]);

  // YouTube IFrame Player API
  useEffect(() => {
    if (!localYtId) {
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
      return;
    }
    const createPlayer = () => {
      if (!window.YT?.Player) return;
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = new window.YT.Player("yt-player-frame", {
        videoId: localYtId,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          enablejsapi: 1,
          origin: typeof window !== "undefined" ? window.location.origin : "",
        },
      });
    };
    if (window.YT?.loaded) {
      createPlayer();
    } else {
      window.onYouTubeIframeAPIReady = createPlayer;
      if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
    return () => {
      ytPlayerRef.current?.destroy();
      ytPlayerRef.current = null;
    };
  }, [localYtId]);

  const handleMarkStart = useCallback(() => {
    const t = ytPlayerRef.current?.getCurrentTime() ?? 0;
    setClipRange(t, useEditorStore.getState().clipEndTime);
  }, [setClipRange]);

  const handleMarkEnd = useCallback(() => {
    const t = ytPlayerRef.current?.getCurrentTime() ?? 0;
    setClipRange(useEditorStore.getState().clipStartTime, t);
  }, [setClipRange]);

  // Seek to clip start on selection change
  useEffect(() => {
    if (selectedClipId && videoRef.current) {
      const clip = suggestions.find((c) => c.id === selectedClipId);
      if (clip) {
        videoRef.current.currentTime = clip.start;
        setCurrentTime(clip.start);
      }
    }
  }, [selectedClipId, suggestions, setCurrentTime]);

  // Drive video from store play state
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
      audioContextRef.current?.state === "suspended" && audioContextRef.current.resume();
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const t = parseFloat(e.target.value);
      if (videoRef.current) videoRef.current.currentTime = t;
      setCurrentTime(t);
    },
    [setCurrentTime],
  );

  const handleMuteToggle = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  }, []);

  const handleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const skip = useCallback(
    (delta: number) => {
      if (!videoRef.current) return;
      const next = Math.max(
        0,
        Math.min(duration || videoRef.current.duration || 0, currentTime + delta)
      );
      videoRef.current.currentTime = next;
      setCurrentTime(next);
    },
    [currentTime, duration, setCurrentTime]
  );

  // Keyboard navigation — j/k/l only.
  // Space, ArrowLeft, ArrowRight are owned by EditorPage via shortcutsStore
  // to avoid double-firing on the same keypress.
  useEffect(() => {
    if (!sourceUrl) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.contentEditable === "true"
      ) return;
      switch (e.key) {
        case "j": e.preventDefault(); skip(-10); break;
        case "k": e.preventDefault(); togglePlay(); break;
        case "l": e.preventDefault(); skip(10); break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sourceUrl, skip, togglePlay]);

  // External seek requests (e.g. timeline slider)
  useEffect(() => {
    if (pendingSeek == null || !videoRef.current) return;
    videoRef.current.currentTime = pendingSeek;
    setCurrentTime(pendingSeek);
    clearPendingSeek();
  }, [pendingSeek, clearPendingSeek, setCurrentTime]);

  // Face detection loop
  const detectRef = useRef(detect);
  useEffect(() => { detectRef.current = detect; }, [detect]);
  useEffect(() => {
    if (!isPlaying) return;
    let id: number;
    const animate = () => {
      if (videoRef.current && !videoRef.current.paused && !videoRef.current.ended) {
        detectRef.current(videoRef.current);
      }
      id = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(id);
  }, [isPlaying]);

  const getObjectPosition = () => {
    if (!reframingData?.faceDetected) return "50% 50%";
    const { x, y } = reframingData.center;
    return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`;
  };

  const aspectContainerClass: Record<string, string> = {
    "9:16": "aspect-[9/16] h-full max-h-[75vh] w-auto",
    "1:1": "aspect-square max-h-[65vh] w-auto",
  };
  const aspectClass =
    aspectContainerClass[exportSettings.aspectRatio] ?? aspectContainerClass["9:16"];

  return (
    <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center p-6 h-full gap-3">
      <div
        className={cn(
          "relative bg-card rounded-2xl overflow-hidden flex items-center justify-center group border border-border shadow-2xl",
          aspectClass
        )}
      >
        {/* Status badges */}
        <div className="absolute top-4 right-4 z-50 flex flex-col items-end gap-2">
          {(!isReady || isBuffering) && (
            <div className="flex items-center gap-2 bg-card/90 border border-border px-3 py-1.5 rounded-full text-[10px] font-black text-fg-muted uppercase tracking-widest">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              {isBuffering ? "Buffering..." : "Vision Active"}
            </div>
          )}
          {exportSettings.noiseSuppression > 0 && (
            <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full text-[9px] font-black text-primary uppercase tracking-widest">
              Noise reduction: applied on export
            </div>
          )}
        </div>

        {sourceUrl ? (
          <>
            {localYtId ? (
              <div className="relative w-full h-full flex flex-col">
                <div id="yt-player-frame" className="w-full flex-1" />
                <div className="flex items-center justify-center gap-3 py-2.5 px-4 bg-base/80 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 border border-primary/20"
                    onClick={handleMarkStart}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Mark Start
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 border border-primary/20"
                    onClick={handleMarkEnd}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Mark End
                  </Button>
                </div>
              </div>
            ) : videoError ? (
              <div className="relative w-full h-full flex items-center justify-center">
                {thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt="Video thumbnail"
                    className="absolute inset-0 w-full h-full object-cover opacity-30"
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/20">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">
                      Preview unavailable
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">
                    AI analysis continues in background
                  </p>
                </div>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  src={
                    displayUrl
                      ? proxyRetry > 0
                        ? `${displayUrl}&_r=${proxyRetry}`
                        : displayUrl
                      : sourceUrl
                  }
                  className={cn(
                    "w-full h-full object-cover will-change-[object-position] transition-all duration-500",
                    isBuffering && "blur-md scale-105 opacity-50"
                  )}
                  style={{ objectPosition: getObjectPosition(), filter: getCssFilter() }}
                  controls={false}
                  loop
                  preload="auto"
                  onLoadedMetadata={() => {
                    if (!videoRef.current) return;
                    const v = videoRef.current;
                    setDuration(v.duration);
                    v.playbackRate =
                      useEditorStore.getState().exportSettings.playbackSpeed / 100;
                    if (videoMetadata) {
                      setVideoMetadata({
                        ...videoMetadata,
                        duration: v.duration,
                        nativeWidth: v.videoWidth || videoMetadata.nativeWidth,
                        nativeHeight: v.videoHeight || videoMetadata.nativeHeight,
                      });
                    }
                  }}
                  onWaiting={() => setIsBuffering(true)}
                  onCanPlay={() => { setIsBuffering(false); setVideoError(false); }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onError={() => {
                    if (proxyRetry < 1 && displayUrl) {
                      setTimeout(() => setProxyRetry((r) => r + 1), 4000);
                    } else {
                      const ytId = sourceUrl ? extractYtVideoId(sourceUrl) : null;
                      if (ytId && displayUrl?.includes("proxy-video")) {
                        setLocalYtId(ytId);
                        setDisplayUrl(null);
                        setProxyRetry(0);
                      } else {
                        setVideoError(true);
                      }
                    }
                  }}
                />
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <Loader2
                      className="w-10 h-10 animate-spin text-primary opacity-60"
                      strokeWidth={1}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center gap-4 p-8 select-none">
            <div className="w-14 h-14 rounded-2xl bg-muted border border-border flex items-center justify-center">
              <PlayCircle className="w-6 h-6 text-muted-foreground" strokeWidth={1} />
            </div>
            <div className="text-center">
              <p className="text-sm font-black text-fg-muted uppercase tracking-widest mb-1">
                Paste a YouTube URL to get started
              </p>
              <p className="text-xs text-muted-foreground max-w-[220px]">
                We&apos;ll analyze the video and suggest the best viral clips automatically
              </p>
            </div>
          </div>
        )}

        <CaptionOverlay
          videoRef={videoRef}
          transcript={captionsEnabled && transcript ? transcript : undefined}
        />
        <CanvasLayer />
        <InteractiveCanvas />

        {/* AI execution overlay — pointer-events:none so cancel button above stays clickable */}
        {executionOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 z-40 pointer-events-none">
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center animate-pulse">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <p className="text-xs font-black text-white uppercase tracking-widest drop-shadow-lg">
                {executionOverlayLabel ?? "AI is editing your video…"}
              </p>
            </div>
          </div>
        )}

        {/* Hover overlay — center play/skip buttons */}
        {sourceUrl && !localYtId && !isBuffering && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto">
            <div className="flex items-center gap-3">
              <button
                onClick={() => skip(-10)}
                aria-label="Skip back 10 seconds"
                className="w-10 h-10 rounded-full bg-black/60 border border-border flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center text-zinc-900 hover:bg-white transition-colors"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-zinc-900" />
                ) : (
                  <Play className="w-5 h-5 fill-zinc-900 ml-0.5" />
                )}
              </button>
              <button
                onClick={() => skip(10)}
                aria-label="Skip forward 10 seconds"
                className="w-10 h-10 rounded-full bg-black/60 border border-border flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Persistent custom controls bar — shown when proxy video is active */}
      {sourceUrl && !localYtId && !videoError && (
        <div className="video-controls w-full" style={{ maxWidth: aspectContainerClass[exportSettings.aspectRatio] ? "420px" : "560px" }}>
          {/* Play / Pause */}
          <button
            className="ctrl-btn"
            onClick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>

          {/* Skip back */}
          <button className="ctrl-btn" onClick={() => skip(-10)} aria-label="Skip back 10 seconds">
            <SkipBack size={14} />
          </button>

          {/* Seek track */}
          <div className="seek-track">
            <input
              type="range"
              className="seek-slider"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek"
            />
          </div>

          {/* Skip forward */}
          <button className="ctrl-btn" onClick={() => skip(10)} aria-label="Skip forward 10 seconds">
            <SkipForward size={14} />
          </button>

          {/* Timecode */}
          <span className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Mute */}
          <button className="ctrl-btn" onClick={handleMuteToggle} aria-label={isMuted ? "Unmute" : "Mute"}>
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>

          {/* Fullscreen */}
          <button className="ctrl-btn" onClick={handleFullscreen} aria-label="Fullscreen">
            <Maximize2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
