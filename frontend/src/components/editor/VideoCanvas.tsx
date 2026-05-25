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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/stores/editorStore";
import { API_URL } from "@/lib/api";
import { useFaceTracker } from "@/hooks/useFaceTracker";
import { CaptionOverlay } from "./CaptionOverlay";
import { CanvasLayer } from "./CanvasLayer";
import { cn } from "@/lib/utils";

// Minimal ambient type for YouTube IFrame Player API (auto-loaded from YT CDN).
declare global {
  interface Window {
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string;
          host?: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
          };
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

/** Extract 11-char video ID from any recognised YouTube URL format. */
function extractYtVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export default function VideoCanvas() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseFilterRef = useRef<BiquadFilterNode | null>(null);
  
  const [isBuffering, setIsBuffering] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [proxyRetry, setProxyRetry] = useState(0);

  // YouTube IFrame mode — activated when sourceUrl is a YouTube URL.
  // Local state drives the IFrame player; store state is synced for clip marking.
  const [localYtId, setLocalYtId] = useState<string | null>(null);
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
  } = useEditorStore();

  const { isReady, reframingData, detect } = useFaceTracker();

  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  // Web Audio API — initialise once per video source, then keep in sync
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

        // Highpass filter for live noise suppression (Bug 4)
        noiseFilterRef.current = audioContextRef.current.createBiquadFilter();
        noiseFilterRef.current.type = "highpass";
        noiseFilterRef.current.frequency.value = 80;

        gainNodeRef.current = audioContextRef.current.createGain();
        source.connect(noiseFilterRef.current);
        noiseFilterRef.current.connect(gainNodeRef.current);
        gainNodeRef.current.connect(audioContextRef.current.destination);
      } catch {
        // Cross-origin video without CORS headers — Web Audio unavailable for this source
        audioContextRef.current = null;
      }
    }

    if (gainNodeRef.current) {
      // 0-200% → 0.0-3.0 gain. Base 85% → 1.275 (slightly above unity). (Bug 3)
      gainNodeRef.current.gain.value = (audioBoost / 100) * 1.5;
    } else if (videoRef.current) {
      // Fallback: set native element volume when Web Audio isn't available (Bug 3)
      videoRef.current.volume = Math.min(1, audioBoost / 100);
    }

    if (isPlaying && audioContextRef.current?.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, [exportSettings.audioBoost, isPlaying]);

  // Live Noise Suppression — update highpass filter frequency (Bug 4)
  useEffect(() => {
    if (!noiseFilterRef.current) return;
    // 0% = 80 Hz (nearly flat), 100% = 400 Hz (aggressively cuts low-freq rumble)
    noiseFilterRef.current.frequency.value = 80 + (exportSettings.noiseSuppression / 100) * 320;
  }, [exportSettings.noiseSuppression]);

  // Live Playback Speed — apply on mount and on source change (Bug 2)
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
      setYtVideoId(ytId);  // always sync to store for clip marking
      if (duration <= 1800) {
        // Short enough to stream via proxy — native <video> enables full editing.
        setLocalYtId(null);
        setDisplayUrl(`${API_URL}/api/proxy-video?url=${encodeURIComponent(sourceUrl)}`);
      } else {
        // Too long to proxy — fall back to ToS-compliant IFrame preview.
        setLocalYtId(ytId);
        setDisplayUrl(null);
      }
    } else {
      setLocalYtId(null);
      setYtVideoId(null);
      setDisplayUrl(sourceUrl);
    }
  }, [sourceUrl, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // IFrame fallback timeout — if proxy video never reaches readyState >= 2 within
  // 10s, fall back to the YT IFrame player (handles yt-dlp bot-detection blocks).
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

  // Load the YouTube IFrame Player API script once and create a player
  // instance when a YouTube video ID is available.
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
      // API not yet loaded — inject the script and register the callback.
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

  // Seek to clip start when selection changes
  useEffect(() => {
    if (selectedClipId && videoRef.current) {
      const clip = suggestions.find((c) => c.id === selectedClipId);
      if (clip) {
        videoRef.current.currentTime = clip.start;
        setCurrentTime(clip.start);
      }
    }
  }, [selectedClipId, suggestions, setCurrentTime]);

  // Drive the video element from store isPlaying
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying, setIsPlaying]);

  const skip = useCallback((delta: number) => {
    if (!videoRef.current) return;
    const next = Math.max(0, Math.min(duration || videoRef.current.duration || 0, currentTime + delta));
    videoRef.current.currentTime = next;
    setCurrentTime(next);
  }, [currentTime, duration, setCurrentTime]);

  // Keyboard navigation for seek and play/pause (Bug 5)
  // Must come AFTER skip and togglePlay are declared above.
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
        case "ArrowLeft": e.preventDefault(); skip(-5); break;
        case "ArrowRight": e.preventDefault(); skip(5); break;
        case " ": e.preventDefault(); togglePlay(); break;
        case "j": e.preventDefault(); skip(-10); break;
        case "k": e.preventDefault(); togglePlay(); break;
        case "l": e.preventDefault(); skip(10); break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [sourceUrl, skip, togglePlay]);

  // Respond to external seek requests (e.g. from Timeline slider)
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-full animate-in fade-in zoom-in-95 duration-1000">
      <div className="relative aspect-9/16 h-full max-h-[75vh] depth-card glass-surface rounded-[2.5rem] overflow-hidden flex items-center justify-center group w-auto border border-foreground/5 shadow-2xl">
        <div className="absolute top-6 right-6 z-50 flex flex-col items-end gap-2">
          {(!isReady || isBuffering) && (
            <div className="flex items-center gap-2 glass-surface border border-foreground/10 px-3 py-1.5 rounded-full text-[10px] font-black text-muted-foreground uppercase tracking-widest shadow-xl">
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              {isBuffering ? "Buffering..." : "Vision Active"}
            </div>
          )}
          {exportSettings.noiseSuppression > 0 && (
            <div className="flex items-center gap-2 glass-surface border border-primary/20 px-3 py-1.5 rounded-full text-[9px] font-black text-primary uppercase tracking-widest shadow-xl bg-primary/5">
              Noise reduction: applied on export
            </div>
          )}
        </div>

        {sourceUrl ? (
          <>
            {localYtId ? (
              /* YouTube IFrame mode — ToS-compliant preview with clip marking.
                 Face tracking and audio boost are unavailable in IFrame mode
                 due to cross-origin restrictions; they apply post-extraction. */
              <div className="relative w-full h-full flex flex-col">
                <div id="yt-player-frame" className="w-full flex-1" />
                <div className="flex items-center justify-center gap-3 py-3 px-4 bg-background/80 backdrop-blur-sm border-t border-foreground/10">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 border border-primary/20"
                    onClick={handleMarkStart}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    Mark Start
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 gap-2 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/10 border border-primary/20"
                    onClick={handleMarkEnd}
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    Mark End
                  </Button>
                </div>
              </div>
            ) : videoError ? (
              /* Non-YouTube source failed — show thumbnail fallback */
              <div className="relative w-full h-full flex items-center justify-center">
                {thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt="Video thumbnail"
                    className="absolute inset-0 w-full h-full object-cover opacity-40"
                  />
                )}
                <div className="relative z-10 flex flex-col items-center gap-3 px-6 text-center">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/30">
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
                    "w-full h-full object-cover interactive will-change-[object-position] transition-all duration-500",
                    isBuffering && "blur-md scale-105 opacity-50"
                  )}
                  style={{
                    objectPosition: getObjectPosition(),
                    filter: getCssFilter(),
                  }}
                  controls={false}
                  loop
                  preload="auto"
                  onLoadedMetadata={() => {
                    if (!videoRef.current) return;
                    const v = videoRef.current;
                    setDuration(v.duration);
                    // Re-apply playback rate when a new video loads (Bug 2)
                    v.playbackRate = useEditorStore.getState().exportSettings.playbackSpeed / 100;
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
                  onCanPlay={() => {
                    setIsBuffering(false);
                    setVideoError(false);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onTimeUpdate={() => {
                    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
                  }}
                  onError={() => {
                    if (proxyRetry < 1 && displayUrl) {
                      // Retry once after 4 s — handles cold-start latency on Cloud Run.
                      setTimeout(() => setProxyRetry((r) => r + 1), 4000);
                    } else {
                      // Proxy exhausted retries. For YouTube URLs, fall back to the
                      // IFrame player — works even when yt-dlp is blocked by bot detection.
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
                    <Loader2 className="w-12 h-12 animate-spin text-primary opacity-50" strokeWidth={1} />
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-sm flex flex-col items-center gap-6">
            <div className="bg-foreground/5 p-8 rounded-full border border-foreground/10 shadow-inner group-hover:scale-110 transition-transform duration-700">
              <PlayCircle className="w-12 h-12 opacity-20 text-foreground" strokeWidth={1} />
            </div>
            <div className="space-y-1 text-center">
              <span className="opacity-40 tracking-[0.3em] text-[10px] uppercase font-black block">
                No Signal
              </span>
              <span className="opacity-20 text-[9px] font-bold uppercase tracking-widest block">
                Waiting for input...
              </span>
            </div>
          </div>
        )}

        <CaptionOverlay videoRef={videoRef} transcript={captionsEnabled && transcript ? transcript : undefined} />
        <CanvasLayer />

        {sourceUrl && !localYtId && !isBuffering && !videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 interactive">
            <Button
              variant="ghost"
              size="icon"
              aria-label={isPlaying ? "Pause video" : "Play video"}
              className="w-20 h-20 rounded-full text-white hover:bg-white/10 interactive-scale backdrop-blur-md border border-white/10 shadow-2xl"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 fill-current" aria-hidden="true" />
              ) : (
                <Play className="w-10 h-10 fill-current pl-1.5" aria-hidden="true" />
              )}
            </Button>
          </div>
        )}
      </div>

      {sourceUrl && !localYtId && !videoError && (
        <div className="mt-8 flex items-center gap-6 glass-surface p-2.5 px-6 rounded-full border border-foreground/5 shadow-2xl">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Skip back 10 seconds"
            className="text-muted-foreground hover:text-primary hover:bg-foreground/5 rounded-full w-10 h-10 interactive"
            onClick={() => skip(-10)}
          >
            <SkipBack className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>

          {/* Play/Pause — slide-up icon/text on hover */}
          <Button
            variant="default"
            size="icon"
            aria-label={isPlaying ? "Pause" : "Play"}
            className="relative w-14 h-14 rounded-full bg-primary text-white hover:scale-110 active:scale-95 shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all interactive overflow-hidden group"
            onClick={togglePlay}
            disabled={isBuffering}
          >
            {/* Icon layer — default visible, slides up on hover */}
            <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-in-out group-hover:-translate-y-full" aria-hidden="true">
              {isPlaying ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current pl-1" />
              )}
            </span>
            {/* Visible text label on hover — already conveys the action */}
            <span className="absolute inset-0 flex items-center justify-center transition-transform duration-300 ease-in-out translate-y-full group-hover:translate-y-0 text-[8px] font-black uppercase tracking-widest pointer-events-none" aria-hidden="true">
              {isPlaying ? "Pause" : "Play"}
            </span>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Skip forward 10 seconds"
            className="text-muted-foreground hover:text-primary hover:bg-foreground/5 rounded-full w-10 h-10 interactive"
            onClick={() => skip(10)}
          >
            <SkipForward className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
