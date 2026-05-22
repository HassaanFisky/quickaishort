"use client";

// Module 5 (UI half) — Single-Thread Workspace Dashboard
// CSS Grid layout: left 9:16 interactive canvas, right control panel,
// bottom frame-locked timeline. Wires all five engine modules together.
// Frame capture for export uses canvas.toBlob (JPEG) → FFmpeg worker.

import {
  useRef,
  useEffect,
  useState,
  useCallback,
  type ChangeEvent,
} from "react";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { useEditorStore } from "@/stores/editorStore";
import {
  VideoEngineCore,
  KineticCaptionEngine,
  LiquidTextShader,
  CounterNeonEngine,
  ENGINE_W,
  ENGINE_H,
} from "@/lib/videoEngine";
import type { FrameInfo } from "@/lib/videoEngine";
import type { WordToken } from "@/lib/videoEngine/KineticCaptionEngine";
import styles from "./VideoWorkspace.module.css";

// ── Display dimensions (CSS): 9:16 portrait scaled down to fit the viewport ───
const DISPLAY_W = 360;
const DISPLAY_H = 640; // = 360 × (16/9)

// ── Timeline configuration ────────────────────────────────────────────────────
const TIMELINE_TICK_INTERVAL_SEC = 5;

// ── FFmpeg export constants ───────────────────────────────────────────────────
const EXPORT_FPS = 30;
const MAX_RECORD_FRAMES = 450; // 15 s at 30 fps

// ── Helper: download a Blob as a file ─────────────────────────────────────────
function triggerDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a short delay to ensure the download starts
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Helper: format seconds → M:SS ─────────────────────────────────────────────
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── VideoWorkspace ─────────────────────────────────────────────────────────────
export default function VideoWorkspace() {
  // ── Canvas & engine refs ────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<VideoEngineCore | null>(null);
  const captionRef = useRef<KineticCaptionEngine | null>(null);
  const liquidRef = useRef<LiquidTextShader | null>(null);
  const counterRef = useRef<CounterNeonEngine | null>(null);

  // ── FFmpeg worker ref ───────────────────────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const captureRafRef = useRef<number>(0);
  const captureFrameRef = useRef(0);
  const lastCaptureMsRef = useRef(0);

  // ── Editorstore bindings ────────────────────────────────────────────────────
  const sourceUrl = useEditorStore((s) => s.sourceUrl);
  const transcript = useEditorStore((s) => s.transcript);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const setIsPlaying = useEditorStore((s) => s.setIsPlaying);
  const setCurrentTime = useEditorStore((s) => s.setCurrentTime);

  // ── Playback state local to this component ──────────────────────────────────
  const [engineState, setEngineState] = useState<string>("IDLE");
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // ── Export state ────────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [isEncoding, setIsEncoding] = useState(false);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [workerReady, setWorkerReady] = useState(false);

  // ── Engine config controls ──────────────────────────────────────────────────
  const [captionBlurMs, setCaptionBlurMs] = useState(300);
  const [captionFontSize, setCaptionFontSize] = useState(64);
  const [waveAmplitude, setWaveAmplitude] = useState(18);
  const [waveSpeed, setWaveSpeed] = useState(0.003);
  const [waveFrequency, setWaveFrequency] = useState(0.012);
  const [glowBlur, setGlowBlur] = useState(25);
  const [counterTarget, setCounterTarget] = useState(1_000_000);
  const [liquidText, setLiquidText] = useState("GOING VIRAL");

  // ── Build word tokens from Whisper transcript ────────────────────────────────
  const wordTokens: WordToken[] = transcript?.chunks?.map((c) => ({
    word: c.text.trim(),
    start: c.start,
    end: c.end,
  })) ?? [];

  // ── Initialize engines on mount ──────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new VideoEngineCore(canvas);
    const ctx = engine.context;

    const caption = new KineticCaptionEngine(ctx, {
      canvasWidth: ENGINE_W,
      canvasHeight: ENGINE_H,
      fontSize: captionFontSize,
      blurDurationMs: captionBlurMs,
    });

    const liquid = new LiquidTextShader({
      centerX: ENGINE_W / 2,
      centerY: ENGINE_H * 0.12,
      fontSize: 64,
      amplitude: waveAmplitude,
      speed: waveSpeed,
      frequency: waveFrequency,
      glowBlur,
      text: liquidText,
    });

    const counter = new CounterNeonEngine(
      { x: ENGINE_W / 2, y: ENGINE_H * 0.08, targetValue: counterTarget },
      { canvasWidth: ENGINE_W, canvasHeight: ENGINE_H },
    );

    engineRef.current = engine;
    captionRef.current = caption;
    liquidRef.current = liquid;
    counterRef.current = counter;

    // Wire post-render callback: after each video frame, overlay all effects
    engine.setPostRenderCallback((info: FrameInfo, renderCtx: CanvasRenderingContext2D) => {
      counter.render(renderCtx);
      liquid.render(renderCtx, info.nowMs);
      caption.render(info.nowMs, info.mediaTime);
    });

    engine.on("stateChange", (state) => setEngineState(state));
    engine.on("frameUpdate", (fi) => {
      setCurrentTimeSec(fi.mediaTime);
      setCurrentTime(fi.mediaTime);
    });
    engine.on("loadComplete", ({ duration }) => {
      setDurationSec(duration);
    });
    engine.on("seekComplete", (t) => {
      setCurrentTimeSec(t);
    });

    return () => {
      engine.destroy();
      caption.destroy();
      liquid.destroy();
      counter.destroy();
      engineRef.current = null;
      captionRef.current = null;
      liquidRef.current = null;
      counterRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load source URL when it changes ─────────────────────────────────────────
  useEffect(() => {
    if (!sourceUrl || !engineRef.current) return;
    engineRef.current.load(sourceUrl).catch((err: Error) => {
      toast.error(`Video load failed: ${err.message}`);
    });
  }, [sourceUrl]);

  // ── Sync isPlaying from global store ────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (isPlaying && engine.paused) {
      engine.play();
    } else if (!isPlaying && !engine.paused) {
      engine.pause();
    }
  }, [isPlaying]);

  // ── Sync word tokens to caption engine ──────────────────────────────────────
  useEffect(() => {
    captionRef.current?.setTokens(wordTokens);
  }, [wordTokens]);

  // ── Push config changes to live engines ──────────────────────────────────────
  useEffect(() => {
    captionRef.current?.updateConfig({ blurDurationMs: captionBlurMs, fontSize: captionFontSize });
  }, [captionBlurMs, captionFontSize]);

  useEffect(() => {
    liquidRef.current?.updateConfig({
      amplitude: waveAmplitude,
      speed: waveSpeed,
      frequency: waveFrequency,
      glowBlur,
      text: liquidText,
    });
  }, [waveAmplitude, waveSpeed, waveFrequency, glowBlur, liquidText]);

  useEffect(() => {
    counterRef.current?.updateCounterConfig({ targetValue: counterTarget });
  }, [counterTarget]);

  // ── Initialize FFmpeg worker ─────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL("../../workers/ffmpegExport.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<{
      type: string;
      stage: string;
      payload: Record<string, unknown>;
    }>) => {
      const { type, payload } = e.data;
      switch (type) {
        case "status":
          if (e.data.stage === "ready") setWorkerReady(true);
          break;
        case "progress":
          if (e.data.stage === "encode") {
            setEncodeProgress(payload.progress as number);
          } else if (e.data.stage === "process") {
            setRecordProgress(payload.progress as number);
          }
          break;
        case "complete":
          setIsEncoding(false);
          setEncodeProgress(0);
          const buf = payload.artifact as ArrayBuffer;
          triggerDownload(buf, `quickai-export-${Date.now()}.mp4`);
          toast.success("Export complete — MP4 downloaded");
          break;
        case "error":
          setIsEncoding(false);
          setIsRecording(false);
          toast.error(`Export error: ${payload.message as string}`);
          break;
        case "warning":
          toast.warning(payload.message as string);
          break;
      }
    };

    worker.onerror = (err) => {
      toast.error(`FFmpeg worker crashed: ${err.message}`);
    };

    workerRef.current = worker;
    worker.postMessage({ type: "load", payload: {} });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Playback controls ────────────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.paused) {
      engine.play();
      setIsPlaying(true);
    } else {
      engine.pause();
      setIsPlaying(false);
    }
  }, [setIsPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    const t = value[0];
    engine.seek(t);
    setCurrentTimeSec(t);
  }, []);

  const handleSeekStart = useCallback(() => setIsSeeking(true), []);
  const handleSeekEnd = useCallback(() => setIsSeeking(false), []);

  // ── Start counter animation ──────────────────────────────────────────────────
  const handleStartCounter = useCallback(() => {
    counterRef.current?.startCounter(counterTarget);
  }, [counterTarget]);

  // ── Frame capture loop for FFmpeg export ─────────────────────────────────────
  const startCapture = useCallback(() => {
    if (!workerReady || !canvasRef.current) {
      toast.error("FFmpeg worker not ready. Wait a moment and try again.");
      return;
    }
    const canvas = canvasRef.current;
    const engine = engineRef.current;

    captureFrameRef.current = 0;
    lastCaptureMsRef.current = 0;
    setIsRecording(true);
    setRecordProgress(0);

    workerRef.current?.postMessage({
      type: "startRecording",
      payload: { totalFrames: MAX_RECORD_FRAMES },
    });

    const msPerFrame = 1000 / EXPORT_FPS;

    const captureLoop = (nowMs: number) => {
      if (captureFrameRef.current >= MAX_RECORD_FRAMES) {
        stopCapture();
        return;
      }
      const sinceLastMs = nowMs - lastCaptureMsRef.current;
      if (sinceLastMs >= msPerFrame) {
        lastCaptureMsRef.current = nowMs;
        // Capture JPEG from the composite canvas (includes all overlay engines)
        canvas.toBlob((blob) => {
          if (!blob || !workerRef.current) return;
          blob.arrayBuffer().then((buf) => {
            const bytes = new Uint8Array(buf);
            workerRef.current!.postMessage(
              { type: "frame", payload: { data: bytes, fps: EXPORT_FPS } },
              [bytes.buffer],
            );
            captureFrameRef.current++;
            setRecordProgress(
              Math.round((captureFrameRef.current / MAX_RECORD_FRAMES) * 50),
            );
          });
        }, "image/jpeg", 0.9);
      }

      captureRafRef.current = requestAnimationFrame(captureLoop);
    };

    captureRafRef.current = requestAnimationFrame(captureLoop);
    engine?.play();
    setIsPlaying(true);
  }, [workerReady, setIsPlaying]);

  const stopCapture = useCallback(() => {
    cancelAnimationFrame(captureRafRef.current);
    captureRafRef.current = 0;
    setIsRecording(false);
    engineRef.current?.pause();
    setIsPlaying(false);
    setIsEncoding(true);
    setEncodeProgress(50);
    workerRef.current?.postMessage({
      type: "encode",
      payload: { fps: EXPORT_FPS },
    });
  }, [setIsPlaying]);

  const cancelExport = useCallback(() => {
    cancelAnimationFrame(captureRafRef.current);
    captureRafRef.current = 0;
    setIsRecording(false);
    setIsEncoding(false);
    setRecordProgress(0);
    setEncodeProgress(0);
    workerRef.current?.postMessage({ type: "cancel", payload: {} });
    engineRef.current?.pause();
    setIsPlaying(false);
  }, [setIsPlaying]);

  // ── Timeline tick marks ──────────────────────────────────────────────────────
  const timelineTicks = durationSec > 0
    ? Array.from(
        { length: Math.floor(durationSec / TIMELINE_TICK_INTERVAL_SEC) + 1 },
        (_, i) => i * TIMELINE_TICK_INTERVAL_SEC,
      )
    : [];

  const playheadPct = durationSec > 0
    ? Math.min(100, (currentTimeSec / durationSec) * 100)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.workspace}>
      {/* ── Left: 9:16 interactive canvas viewport ─────────────────────────── */}
      <div className={styles.canvasPane}>
        <div className={styles.canvasFrame}>
          <canvas
            ref={canvasRef}
            width={ENGINE_W}
            height={ENGINE_H}
            className={styles.canvas}
            style={{ width: DISPLAY_W, height: DISPLAY_H }}
          />
          {/* Engine state badge */}
          <span className={styles.stateBadge} data-state={engineState}>
            {engineState}
          </span>
        </div>

        {/* Playback transport below canvas */}
        <div className={styles.transport}>
          <button
            className={styles.transportBtn}
            onClick={handlePlayPause}
            disabled={engineState === "IDLE" || engineState === "LOADING"}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              // Pause icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              // Play icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
          <span className={styles.timecode}>
            {fmtTime(currentTimeSec)} / {fmtTime(durationSec)}
          </span>
        </div>
      </div>

      {/* ── Right: control panel ─────────────────────────────────────────────── */}
      <div className={styles.controlPanel}>

        {/* Caption settings */}
        <section className={styles.controlSection}>
          <h3 className={styles.sectionTitle}>Caption Engine</h3>

          <label className={styles.sliderLabel}>
            Blur Duration <span className={styles.sliderValue}>{captionBlurMs} ms</span>
          </label>
          <Slider
            min={50}
            max={800}
            step={10}
            value={[captionBlurMs]}
            onValueChange={(v) => setCaptionBlurMs(v[0])}
            className={styles.slider}
          />

          <label className={styles.sliderLabel}>
            Font Size <span className={styles.sliderValue}>{captionFontSize} px</span>
          </label>
          <Slider
            min={32}
            max={120}
            step={2}
            value={[captionFontSize]}
            onValueChange={(v) => setCaptionFontSize(v[0])}
            className={styles.slider}
          />
        </section>

        {/* Wave shader settings */}
        <section className={styles.controlSection}>
          <h3 className={styles.sectionTitle}>Liquid Text Shader</h3>

          <div className={styles.textInputRow}>
            <label className={styles.sliderLabel}>Text</label>
            <input
              type="text"
              className={styles.textInput}
              value={liquidText}
              maxLength={24}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setLiquidText(e.target.value)}
            />
          </div>

          <label className={styles.sliderLabel}>
            Amplitude <span className={styles.sliderValue}>{waveAmplitude} px</span>
          </label>
          <Slider
            min={4}
            max={60}
            step={1}
            value={[waveAmplitude]}
            onValueChange={(v) => setWaveAmplitude(v[0])}
            className={styles.slider}
          />

          <label className={styles.sliderLabel}>
            Speed <span className={styles.sliderValue}>{waveSpeed.toFixed(4)}</span>
          </label>
          <Slider
            min={0.0005}
            max={0.012}
            step={0.0005}
            value={[waveSpeed]}
            onValueChange={(v) => setWaveSpeed(v[0])}
            className={styles.slider}
          />

          <label className={styles.sliderLabel}>
            Frequency <span className={styles.sliderValue}>{waveFrequency.toFixed(4)}</span>
          </label>
          <Slider
            min={0.002}
            max={0.06}
            step={0.001}
            value={[waveFrequency]}
            onValueChange={(v) => setWaveFrequency(v[0])}
            className={styles.slider}
          />

          <label className={styles.sliderLabel}>
            Glow Radius <span className={styles.sliderValue}>{glowBlur} px</span>
          </label>
          <Slider
            min={0}
            max={60}
            step={1}
            value={[glowBlur]}
            onValueChange={(v) => setGlowBlur(v[0])}
            className={styles.slider}
          />
        </section>

        {/* Counter settings */}
        <section className={styles.controlSection}>
          <h3 className={styles.sectionTitle}>Counter Explosion</h3>

          <label className={styles.sliderLabel}>
            Target Value <span className={styles.sliderValue}>{counterTarget.toLocaleString()}</span>
          </label>
          <Slider
            min={1000}
            max={10_000_000}
            step={1000}
            value={[counterTarget]}
            onValueChange={(v) => setCounterTarget(v[0])}
            className={styles.slider}
          />

          <button
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={handleStartCounter}
          >
            Launch Counter
          </button>
        </section>

        {/* Export section */}
        <section className={styles.controlSection}>
          <h3 className={styles.sectionTitle}>Local MP4 Export</h3>

          {!workerReady && (
            <p className={styles.hint}>Loading FFmpeg.wasm…</p>
          )}

          {workerReady && !isRecording && !isEncoding && (
            <button
              className={`${styles.actionBtn} ${styles.actionBtnAccent}`}
              onClick={startCapture}
              disabled={engineState === "IDLE" || engineState === "LOADING"}
            >
              Record &amp; Export MP4
            </button>
          )}

          {isRecording && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${recordProgress}%` }}
                />
              </div>
              <p className={styles.hint}>
                Capturing frames… {recordProgress}% ({captureFrameRef.current}/{MAX_RECORD_FRAMES})
              </p>
              <button
                className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                onClick={stopCapture}
              >
                Stop &amp; Encode
              </button>
              <button
                className={styles.actionBtnGhost}
                onClick={cancelExport}
              >
                Cancel
              </button>
            </>
          )}

          {isEncoding && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${encodeProgress}%` }}
                />
              </div>
              <p className={styles.hint}>Encoding H.264… {encodeProgress}%</p>
            </>
          )}
        </section>
      </div>

      {/* ── Bottom: frame-locked timeline ──────────────────────────────────────── */}
      <div className={styles.timelinePane}>
        <div className={styles.timelineTrack}>
          {/* Tick marks */}
          {timelineTicks.map((tickSec) => (
            <div
              key={tickSec}
              className={styles.timelineTick}
              style={{
                left: durationSec > 0
                  ? `${(tickSec / durationSec) * 100}%`
                  : "0%",
              }}
            >
              <span className={styles.tickLabel}>{fmtTime(tickSec)}</span>
            </div>
          ))}

          {/* Scrub slider — frame-locked via engine seek */}
          <Slider
            min={0}
            max={Math.max(durationSec, 0.001)}
            step={1 / 30}
            value={[currentTimeSec]}
            onValueChange={handleSeek}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            className={styles.timelineSlider}
            disabled={durationSec === 0}
          />

          {/* Playhead indicator */}
          <div
            className={styles.playhead}
            style={{ left: `${playheadPct}%` }}
            aria-label={`Playhead at ${fmtTime(currentTimeSec)}`}
          />
        </div>

        <div className={styles.timelineFooter}>
          <span className={styles.timelineTimecode}>{fmtTime(currentTimeSec)}</span>
          <span className={styles.timelineDuration}>{fmtTime(durationSec)}</span>
        </div>
      </div>
    </div>
  );
}
