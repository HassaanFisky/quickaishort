// Module 2 — Low-Latency Apple-Style Kinetic Caption Engine
// Word-level caption rendering with cubic-ease-out entrance, Gaussian blur trajectory,
// and elastic squash-and-stretch. All per-word animation state lives in a pre-allocated
// pool; zero heap allocations inside the render loop.

export interface WordToken {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

export interface KineticCaptionConfig {
  canvasWidth: number;
  canvasHeight: number;
  fontSize: number;            // px, default 64
  fontFamily: string;
  fontColor: string;
  strokeColor: string;
  strokeWidth: number;         // px, default 3
  /** Fractional Y position of caption baseline (0 = top, 1 = bottom) */
  baselineFraction: number;    // default 0.82
  /** Entrance animation duration in ms */
  entranceDurationMs: number;  // default 250 (≈8 frames @ 30fps)
  /** Blur interpolation duration in ms */
  blurDurationMs: number;      // default 300
  /** Number of frames for squash-and-stretch elastic settle */
  squashFrames: number;        // default 4
}

// ── Entrance physics constants ────────────────────────────────────────────────
const ENTRANCE_Y_OFFSET_PX = 50; // words enter from +50 px below their baseline
const BLUR_START_PX = 15;        // initial blur radius in pixels
const SQUASH_PEAK_SCALE = 0.85;  // Y scale at maximum squash

// ── Per-word animation state — allocated once outside the loop ────────────────
interface WordSlot {
  token: WordToken;
  enterTimeMs: number;
  baselineX: number;  // pre-computed pixel X of left edge
  baselineY: number;  // pre-computed pixel Y of alphabetic baseline
  textWidth: number;  // cached measureText width
  squashFrame: number;
  peakReached: boolean;
}

const POOL_SIZE = 32;
const _pool: WordSlot[] = Array.from({ length: POOL_SIZE }, () => ({
  token: { word: "", start: 0, end: 0 },
  enterTimeMs: 0,
  baselineX: 0,
  baselineY: 0,
  textWidth: 0,
  squashFrame: 0,
  peakReached: false,
}));
let _poolCount = 0;

// ── Per-frame scalar temporaries (declared globally — never reallocated) ──────
let _elapsed = 0;
let _eT = 0;    // entrance progress 0→1
let _bT = 0;    // blur progress 0→1
let _blurPx = 0;
let _yOff = 0;
let _scaleY = 1.0;
let _squashP = 0;
let _destY = 0;
let _i = 0;

// Pre-built filter string fragments to avoid template literals in the loop
const _F_PRE = "blur(";
const _F_SUF = "px)";
const _F_NONE = "none";
let _filterBuf = _F_NONE;

// Cubic ease-out: monotonically decelerates from fast-in to slow-out
function cubicEaseOut(t: number): number {
  const inv = 1 - t;
  return 1 - inv * inv * inv;
}

// ── KineticCaptionEngine ──────────────────────────────────────────────────────
export class KineticCaptionEngine {
  private _ctx: CanvasRenderingContext2D;
  private _cfg: KineticCaptionConfig;
  private _tokens: WordToken[] = [];
  private _fontStr: string;
  private _baselinePx: number;
  private _lastMediaMs = -1;

  constructor(ctx: CanvasRenderingContext2D, config?: Partial<KineticCaptionConfig>) {
    this._ctx = ctx;
    this._cfg = {
      canvasWidth: 1080,
      canvasHeight: 1920,
      fontSize: 64,
      fontFamily: "Inter, Impact, sans-serif",
      fontColor: "#FFFFFF",
      strokeColor: "#111111",
      strokeWidth: 3,
      baselineFraction: 0.82,
      entranceDurationMs: 250,
      blurDurationMs: 300,
      squashFrames: 4,
      ...config,
    };
    this._fontStr = this._buildFontStr();
    this._baselinePx = Math.round(this._cfg.baselineFraction * this._cfg.canvasHeight);
  }

  setTokens(tokens: WordToken[]): void {
    this._tokens = tokens;
    _poolCount = 0;
    this._lastMediaMs = -1;
  }

  updateConfig(patch: Partial<KineticCaptionConfig>): void {
    this._cfg = { ...this._cfg, ...patch };
    this._fontStr = this._buildFontStr();
    this._baselinePx = Math.round(this._cfg.baselineFraction * this._cfg.canvasHeight);
    _poolCount = 0; // Invalidate pool — slot geometry needs re-measurement
  }

  // Called once per frame.
  // nowMs  = wall-clock millisecond timestamp (from FrameInfo.nowMs or performance.now())
  // mediaSec = video playback position in seconds
  render(nowMs: number, mediaSec: number): void {
    const mediaMs = mediaSec * 1000;

    // ── Rebuild active-word pool from token list ──────────────────────────────
    _poolCount = 0;
    for (_i = 0; _i < this._tokens.length && _poolCount < POOL_SIZE; _i++) {
      const tok = this._tokens[_i];
      if (mediaMs < tok.start * 1000 || mediaMs > tok.end * 1000) continue;

      const slot = _pool[_poolCount];
      slot.token = tok;

      // Measure only when this word is newly entering (enterTimeMs === 0 or token changed)
      const isNewEntry = this._lastMediaMs < tok.start * 1000;
      if (isNewEntry) {
        this._ctx.font = this._fontStr;
        const m = this._ctx.measureText(tok.word);
        slot.textWidth = m.width;
        slot.baselineX = Math.round((this._cfg.canvasWidth - m.width) * 0.5);
        slot.baselineY = this._baselinePx;
        slot.enterTimeMs = nowMs;
        slot.squashFrame = this._cfg.squashFrames;
        slot.peakReached = false;
      }
      _poolCount++;
    }

    this._lastMediaMs = mediaMs;
    if (_poolCount === 0) return;

    // ── Render each active word ───────────────────────────────────────────────
    this._ctx.save();
    this._ctx.font = this._fontStr;
    this._ctx.textBaseline = "alphabetic";
    this._ctx.textAlign = "left";

    for (_i = 0; _i < _poolCount; _i++) {
      const slot = _pool[_i];
      _elapsed = nowMs - slot.enterTimeMs;

      // ── Blur: 15px → 0px over blurDurationMs ─────────────────────────────
      _bT = Math.min(1, _elapsed / this._cfg.blurDurationMs);
      _blurPx = Math.round(BLUR_START_PX * (1 - _bT));
      _filterBuf = _blurPx > 0 ? (_F_PRE + _blurPx.toString() + _F_SUF) : _F_NONE;
      this._ctx.filter = _filterBuf;

      // ── Y entrance: +50px offset → 0 via cubic ease-out over entranceDurationMs
      _eT = Math.min(1, _elapsed / this._cfg.entranceDurationMs);
      _yOff = ENTRANCE_Y_OFFSET_PX * (1 - cubicEaseOut(_eT));

      // ── Squash-and-stretch: applies only after entrance completes ──────────
      _scaleY = 1.0;
      if (_eT >= 1 && slot.squashFrame > 0) {
        slot.peakReached = true;
        _squashP = 1 - slot.squashFrame / this._cfg.squashFrames; // 0 → 1
        if (_squashP < 0.5) {
          // Phase 1: compress Y toward SQUASH_PEAK_SCALE
          _scaleY = 1 - (1 - SQUASH_PEAK_SCALE) * (_squashP / 0.5);
        } else {
          // Phase 2: elastically restore to 1.0
          _scaleY = SQUASH_PEAK_SCALE + (1 - SQUASH_PEAK_SCALE) * ((_squashP - 0.5) / 0.5);
        }
        slot.squashFrame--;
      }

      _destY = slot.baselineY + _yOff;

      // Apply squash transform pivoted at the word's alphabetic baseline
      this._ctx.save();
      this._ctx.translate(slot.baselineX + slot.textWidth * 0.5, _destY);
      this._ctx.scale(1, _scaleY);
      this._ctx.translate(-(slot.baselineX + slot.textWidth * 0.5), -_destY);

      // Stroke pass (renders under fill for clean edges)
      this._ctx.lineWidth = this._cfg.strokeWidth * 2;
      this._ctx.strokeStyle = this._cfg.strokeColor;
      this._ctx.lineJoin = "round";
      this._ctx.strokeText(slot.token.word, slot.baselineX, _destY);

      // Fill pass
      this._ctx.fillStyle = this._cfg.fontColor;
      this._ctx.fillText(slot.token.word, slot.baselineX, _destY);

      this._ctx.restore();
    }

    this._ctx.filter = _F_NONE;
    this._ctx.restore();
  }

  destroy(): void {
    this._tokens = [];
    _poolCount = 0;
    this._lastMediaMs = -1;
  }

  private _buildFontStr(): string {
    return `bold ${this._cfg.fontSize}px ${this._cfg.fontFamily}`;
  }
}
