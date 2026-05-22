// Module 1 — High-Throughput Media Routing Controller
// Dual HTML5 media element architecture with requestVideoFrameCallback master clock.
// All crop-matrix fields and frame-info objects are pre-allocated; no heap activity
// inside the render loop.

// Type declarations for requestVideoFrameCallback live in
// src/types/video-frame-callback.d.ts to avoid duplicate-identifier errors.

// ── Deterministic state machine ───────────────────────────────────────────────
export type EngineState = "IDLE" | "LOADING" | "PLAYING" | "PAUSED" | "EXPORTING" | "ERROR";

export interface FrameInfo {
  presentedFrames: number;
  mediaTime: number;
  expectedDisplayTime: DOMHighResTimeStamp;
  nowMs: DOMHighResTimeStamp;
}

export interface EngineEventMap {
  stateChange: EngineState;
  frameUpdate: FrameInfo;
  error: Error;
  loadComplete: { duration: number; videoWidth: number; videoHeight: number };
  seekComplete: number;
}

type EngineListener<K extends keyof EngineEventMap> = (data: EngineEventMap[K]) => void;

export type PostRenderCallback = (
  info: FrameInfo,
  ctx: CanvasRenderingContext2D,
) => void;

// ── Canvas constants: 9:16 portrait 1080 × 1920 ──────────────────────────────
export const ENGINE_W = 1080;
export const ENGINE_H = 1920;

// ── Pre-allocated crop matrix (mutated on source-resize, never in rAF loop) ───
const _crop = {
  sx: 0, sy: 0, sw: 0, sh: 0,
  dx: 0, dy: 0, dw: ENGINE_W, dh: ENGINE_H,
};

// ── Pre-allocated frame-info object (mutated in place each callback) ──────────
const _fi: FrameInfo = { presentedFrames: 0, mediaTime: 0, expectedDisplayTime: 0, nowMs: 0 };

// ── Non-destructive 9:16 crop computation ─────────────────────────────────────
function computeCropMatrix(srcW: number, srcH: number): void {
  const TARGET = ENGINE_W / ENGINE_H; // 0.5625
  const src = srcW / srcH;
  if (src > TARGET) {
    // Source is wider — trim left/right
    _crop.sh = srcH;
    _crop.sw = Math.round(srcH * TARGET);
    _crop.sx = Math.round((srcW - _crop.sw) * 0.5);
    _crop.sy = 0;
  } else {
    // Source is taller — trim top/bottom
    _crop.sw = srcW;
    _crop.sh = Math.round(srcW / TARGET);
    _crop.sx = 0;
    _crop.sy = Math.round((srcH - _crop.sh) * 0.5);
  }
  _crop.dx = 0;
  _crop.dy = 0;
  _crop.dw = ENGINE_W;
  _crop.dh = ENGINE_H;
}

// ── VideoEngineCore ────────────────────────────────────────────────────────────
export class VideoEngineCore {
  private readonly _canvas: HTMLCanvasElement;
  private readonly _ctx: CanvasRenderingContext2D;
  private readonly _video: HTMLVideoElement;
  private readonly _audio: HTMLAudioElement;

  private _state: EngineState = "IDLE";
  private _rvfcHandle = 0;
  private _rafHandle = 0;
  private _hasRVFC = false;
  private _lastRafTime = -1;
  private _mounted = false;
  private _postRender: PostRenderCallback | null = null;

  private readonly _listeners: {
    [K in keyof EngineEventMap]?: Set<EngineListener<K>>;
  } = {};

  constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
    this._canvas.width = ENGINE_W;
    this._canvas.height = ENGINE_H;

    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error("VideoEngineCore: cannot acquire 2D context");
    this._ctx = ctx;

    // Video element — never inserted into the DOM; used only as a texture source
    this._video = document.createElement("video");
    this._video.muted = true;        // audio is handled by _audio below
    this._video.playsInline = true;
    this._video.crossOrigin = "anonymous";
    this._video.preload = "auto";

    // Dedicated audio element for an unthrottled audio routing path
    this._audio = document.createElement("audio");
    this._audio.crossOrigin = "anonymous";
    this._audio.preload = "auto";

    this._hasRVFC =
      typeof (this._video as HTMLVideoElement).requestVideoFrameCallback === "function";

    this._bindInternalEvents();
    this._mounted = true;
  }

  // ── Getters ──────────────────────────────────────────────────────────────────
  get state(): EngineState { return this._state; }
  get canvas(): HTMLCanvasElement { return this._canvas; }
  get context(): CanvasRenderingContext2D { return this._ctx; }
  get videoElement(): HTMLVideoElement { return this._video; }
  get currentTime(): number { return this._video.currentTime; }
  get duration(): number { return this._video.duration || 0; }
  get paused(): boolean { return this._video.paused; }

  // ── Event emitter ─────────────────────────────────────────────────────────────
  on<K extends keyof EngineEventMap>(event: K, listener: EngineListener<K>): void {
    if (!this._listeners[event]) {
      (this._listeners as Record<string, Set<unknown>>)[event] = new Set();
    }
    (this._listeners[event] as Set<EngineListener<K>>).add(listener);
  }

  off<K extends keyof EngineEventMap>(event: K, listener: EngineListener<K>): void {
    (this._listeners[event] as Set<EngineListener<K>> | undefined)?.delete(listener);
  }

  setPostRenderCallback(cb: PostRenderCallback | null): void {
    this._postRender = cb;
  }

  // ── Source management ─────────────────────────────────────────────────────────
  async load(url: string): Promise<void> {
    if (!this._mounted) return;
    this._teardown();
    this._setState("LOADING");

    this._video.src = url;
    this._audio.src = url;

    return new Promise<void>((resolve, reject) => {
      const onLoaded = () => {
        off();
        computeCropMatrix(this._video.videoWidth, this._video.videoHeight);
        this._setState("PAUSED");
        this._emit("loadComplete", {
          duration: this._video.duration,
          videoWidth: this._video.videoWidth,
          videoHeight: this._video.videoHeight,
        });
        this._blitFrame(); // Paint first frame so canvas is not black
        resolve();
      };
      const onError = () => {
        off();
        const err = new Error(`VideoEngineCore: load failed — "${url}"`);
        this._setState("ERROR");
        this._emit("error", err);
        reject(err);
      };
      const off = () => {
        this._video.removeEventListener("loadeddata", onLoaded);
        this._video.removeEventListener("error", onError);
      };
      this._video.addEventListener("loadeddata", onLoaded, { once: true });
      this._video.addEventListener("error", onError, { once: true });
      this._video.load();
    });
  }

  play(): void {
    if (!this._mounted) return;
    if (this._state !== "PAUSED") return;
    this._video.play().then(() => {
      this._audio.currentTime = this._video.currentTime;
      this._audio.play().catch(() => undefined); // Autoplay policy may block
      this._setState("PLAYING");
      this._startLoop();
    }).catch((err: Error) => {
      this._setState("ERROR");
      this._emit("error", err);
    });
  }

  pause(): void {
    if (!this._mounted) return;
    this._video.pause();
    this._audio.pause();
    this._stopLoop();
    if (this._state === "PLAYING") this._setState("PAUSED");
    this._blitFrame(); // Hold last frame on canvas
  }

  seek(timeSec: number): void {
    const t = Math.max(0, Math.min(timeSec, this.duration));
    this._video.currentTime = t;
    this._audio.currentTime = t;
  }

  setVolume(v: number): void {
    this._audio.volume = Math.max(0, Math.min(1, v));
  }

  setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(4, rate));
    this._video.playbackRate = clamped;
    this._audio.playbackRate = clamped;
  }

  beginExport(): void {
    if (this._state === "PAUSED" || this._state === "PLAYING") {
      this._setState("EXPORTING");
    }
  }

  endExport(): void {
    if (this._state === "EXPORTING") this._setState("PAUSED");
  }

  destroy(): void {
    if (!this._mounted) return;
    this._mounted = false;
    this._teardown();
    this._video.src = "";
    this._audio.src = "";
    this._video.load();
    this._audio.load();
    // Flush canvas to opaque black
    this._ctx.fillStyle = "#000000";
    this._ctx.fillRect(0, 0, ENGINE_W, ENGINE_H);
    // Remove all listeners
    for (const k of Object.keys(this._listeners)) {
      delete (this._listeners as Record<string, unknown>)[k];
    }
    this._postRender = null;
    this._setState("IDLE");
  }

  // ── Private: frame rendering ──────────────────────────────────────────────────

  private _blitFrame(): void {
    if (this._video.readyState < 2) return;
    this._ctx.drawImage(
      this._video,
      _crop.sx, _crop.sy, _crop.sw, _crop.sh,
      _crop.dx, _crop.dy, _crop.dw, _crop.dh,
    );
  }

  private _onFrame(
    nowMs: DOMHighResTimeStamp,
    mediaTime: number,
    presentedFrames: number,
    expectedDisplayTime: DOMHighResTimeStamp,
  ): void {
    if (!this._mounted || this._state !== "PLAYING") return;
    this._blitFrame();
    _fi.nowMs = nowMs;
    _fi.mediaTime = mediaTime;
    _fi.presentedFrames = presentedFrames;
    _fi.expectedDisplayTime = expectedDisplayTime;
    this._postRender?.(_fi, this._ctx);
    this._emit("frameUpdate", _fi);
  }

  // ── Private: frame loop ───────────────────────────────────────────────────────

  private _startLoop(): void {
    this._stopLoop();
    this._hasRVFC ? this._scheduleRVFC() : this._scheduleRAF();
  }

  private _stopLoop(): void {
    if (this._rvfcHandle !== 0) {
      this._video.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = 0;
    }
    if (this._rafHandle !== 0) {
      cancelAnimationFrame(this._rafHandle);
      this._rafHandle = 0;
    }
  }

  private _scheduleRVFC(): void {
    this._rvfcHandle = this._video.requestVideoFrameCallback(
      (now: DOMHighResTimeStamp, meta: VideoFrameCallbackMetadata) => {
        if (!this._mounted || this._state !== "PLAYING") return;
        this._onFrame(now, meta.mediaTime, meta.presentedFrames, meta.expectedDisplayTime);
        this._scheduleRVFC();
      },
    );
  }

  private _scheduleRAF(): void {
    this._rafHandle = requestAnimationFrame((nowMs: DOMHighResTimeStamp) => {
      if (!this._mounted || this._state !== "PLAYING") return;
      const t = this._video.currentTime;
      // Only blit when the decoded media time has actually advanced
      if (t !== this._lastRafTime) {
        this._lastRafTime = t;
        this._onFrame(nowMs, t, 0, nowMs);
      }
      this._scheduleRAF();
    });
  }

  // ── Private: lifecycle helpers ────────────────────────────────────────────────

  private _teardown(): void {
    this._stopLoop();
    this._video.pause();
    this._audio.pause();
    this._lastRafTime = -1;
  }

  private _bindInternalEvents(): void {
    this._video.addEventListener("seeked", () => {
      this._blitFrame();
      this._emit("seekComplete", this._video.currentTime);
    });
    this._video.addEventListener("ended", () => {
      this._stopLoop();
      this._setState("PAUSED");
    });
    this._video.addEventListener("resize", () => {
      // Adaptive-streaming quality switch — recompute crop to match new source dimensions
      computeCropMatrix(this._video.videoWidth, this._video.videoHeight);
    });
  }

  private _setState(next: EngineState): void {
    if (this._state === next) return;
    this._state = next;
    this._emit("stateChange", next);
  }

  private _emit<K extends keyof EngineEventMap>(event: K, data: EngineEventMap[K]): void {
    (this._listeners[event] as Set<EngineListener<K>> | undefined)?.forEach((fn) => fn(data));
  }
}
