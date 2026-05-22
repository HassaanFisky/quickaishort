// Module 4 — High-Velocity Counter & Adaptive Glowing Neon Border
// Counter: exponential acceleration LUT over 45 frames, trailing spin characters,
// 6-frame scale-bounce explosion + brightness flash on completion.
// Border: two-pass rendering — thick blurred ambient layer, then a 4px sharp
// gradient stroke with per-frame rotating angle.

export interface CounterConfig {
  /** Final numeric value displayed after animation completes */
  targetValue: number;
  /** Pixel X center of the counter on the canvas */
  x: number;
  /** Pixel Y center of the counter on the canvas */
  y: number;
  fontSize: number;        // px, default 96
  fontFamily: string;
  color: string;           // fill color, default "#FFFFFF"
  prefix: string;          // e.g. "+" or "$"
  suffix: string;          // e.g. "K" or "%"
  /** Total animation duration in frames (exactly 45) */
  totalFrames: number;     // must be 45
}

export interface NeonBorderConfig {
  canvasWidth: number;
  canvasHeight: number;
  cornerRadius: number;    // px, default 15
  /** Pass-1 ambient stroke width */
  ambientStrokeWidth: number; // px, default 20
  ambientBlur: number;     // shadow blur for pass 1, default 20
  /** Pass-2 sharp inner stroke */
  sharpStrokeWidth: number;   // px, default 4
  /** Multi-stop gradient colors cycling around the border */
  gradientColors: string[];
  /** Radians added to gradient rotation angle each frame */
  rotationSpeed: number;   // default 0.04
}

// ── Pre-computed exponential acceleration LUT for exactly 45 frames ───────────
// f(t) = (e^(k·t) - 1) / (e^k - 1), k=4 → strong tail acceleration
const EXP_LUT: Float64Array = new Float64Array(46);
(function buildLUT() {
  const k = 4;
  const denom = Math.exp(k) - 1;
  for (let i = 0; i <= 45; i++) {
    EXP_LUT[i] = (Math.exp(k * (i / 45)) - 1) / denom;
  }
})();

// ── Spin-character pool for trailing digit animation ──────────────────────────
const SPIN: string[] = "!@#$%^&*0123456789ABCDEF".split("");

// ── Bounce parameters ─────────────────────────────────────────────────────────
const BOUNCE_FRAMES = 6;
const BOUNCE_PEAK_SCALE = 1.25;  // over-scale at apex
const BOUNCE_DIP_SCALE = 0.95;   // slight undershoot before settling

// ── Per-frame temporary scalars (module-level — zero GC in render loop) ───────
let _gradAngle = 0; // accumulates across frames

// ── CounterNeonEngine ─────────────────────────────────────────────────────────
export class CounterNeonEngine {
  private _counterCfg: CounterConfig;
  private _neonCfg: NeonBorderConfig;
  private _fontStr: string;

  // Counter animation state
  private _active = false;
  private _frame = 0;
  private _target = 0;
  private _bounceFrame = 0;
  private _bounceActive = false;
  private _bounceScale = 1;
  private _flashAlpha = 0;

  // Number formatting buffer (avoids String construction inside the loop)
  private _formattedBuf = "";

  constructor(
    counterCfg?: Partial<CounterConfig>,
    neonCfg?: Partial<NeonBorderConfig>,
  ) {
    this._counterCfg = {
      targetValue: 1_000_000,
      x: 540,
      y: 300,
      fontSize: 96,
      fontFamily: "Inter, Impact, sans-serif",
      color: "#FFFFFF",
      prefix: "",
      suffix: "",
      totalFrames: 45,
      ...counterCfg,
    };
    this._neonCfg = {
      canvasWidth: 1080,
      canvasHeight: 1920,
      cornerRadius: 15,
      ambientStrokeWidth: 20,
      ambientBlur: 20,
      sharpStrokeWidth: 4,
      gradientColors: ["#a855f7", "#ec4899", "#a855f7", "#00AAFF", "#a855f7"],
      rotationSpeed: 0.04,
      ...neonCfg,
    };
    this._fontStr = this._buildFontStr();
  }

  /** Kick off counter animation to targetValue (or the config default) */
  startCounter(targetValue?: number): void {
    this._target = targetValue ?? this._counterCfg.targetValue;
    this._frame = 0;
    this._active = true;
    this._bounceActive = false;
    this._bounceFrame = 0;
    this._bounceScale = 1;
    this._flashAlpha = 0;
  }

  updateCounterConfig(patch: Partial<CounterConfig>): void {
    this._counterCfg = { ...this._counterCfg, ...patch };
    this._fontStr = this._buildFontStr();
  }

  updateNeonConfig(patch: Partial<NeonBorderConfig>): void {
    this._neonCfg = { ...this._neonCfg, ...patch };
  }

  /** Call once per render frame — draws the neon border and (if active) the counter */
  render(ctx: CanvasRenderingContext2D): void {
    this._renderNeonBorder(ctx);
    if (this._active || this._bounceActive) {
      this._renderCounter(ctx);
    }
  }

  destroy(): void {
    this._active = false;
    this._bounceActive = false;
  }

  // ── Counter rendering ─────────────────────────────────────────────────────────

  private _renderCounter(ctx: CanvasRenderingContext2D): void {
    const cfg = this._counterCfg;
    let displayValue = 0;
    let spinSuffix = "";

    if (this._active && this._frame < cfg.totalFrames) {
      // Exponential acceleration — LUT index clamped to [0, 45]
      const lutIdx = Math.min(this._frame, 45);
      displayValue = Math.floor(EXP_LUT[lutIdx] * this._target);

      // Trailing spin: two characters cycle through SPIN pool
      const s1 = SPIN[(this._frame + 0) % SPIN.length];
      const s2 = SPIN[(this._frame + 7) % SPIN.length];
      spinSuffix = s1 + s2;

      this._frame++;
    } else if (this._active) {
      // Counter reached its final value — trigger bounce
      displayValue = this._target;
      spinSuffix = "";
      this._active = false;
      this._bounceActive = true;
      this._bounceFrame = 0;
    } else {
      // Bounce settling phase
      displayValue = this._target;
    }

    // Format with thousand-separator commas (no regex, no String.replace)
    this._formattedBuf = this._formatNumber(displayValue);
    const label = cfg.prefix + this._formattedBuf + spinSuffix + cfg.suffix;

    // ── Bounce scale / flash calculation ──────────────────────────────────────
    this._bounceScale = 1;
    this._flashAlpha = 0;

    if (this._bounceActive && this._bounceFrame < BOUNCE_FRAMES) {
      const bp = this._bounceFrame / BOUNCE_FRAMES; // 0 → 1
      if (bp < 0.33) {
        this._bounceScale = 1 + (BOUNCE_PEAK_SCALE - 1) * (bp / 0.33);
      } else if (bp < 0.66) {
        this._bounceScale = BOUNCE_PEAK_SCALE - (BOUNCE_PEAK_SCALE - BOUNCE_DIP_SCALE) * ((bp - 0.33) / 0.33);
      } else {
        this._bounceScale = BOUNCE_DIP_SCALE + (1 - BOUNCE_DIP_SCALE) * ((bp - 0.66) / 0.34);
      }
      this._flashAlpha = Math.max(0, 1 - bp * 2.5);
      this._bounceFrame++;
      if (this._bounceFrame >= BOUNCE_FRAMES) {
        this._bounceActive = false;
        this._bounceScale = 1;
      }
    }

    // ── Brightness flash overlay ───────────────────────────────────────────────
    if (this._flashAlpha > 0.005) {
      ctx.save();
      ctx.globalAlpha = this._flashAlpha * 0.4;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(cfg.x - 500, cfg.y - 120, 1000, 220);
      ctx.restore();
    }

    // ── Draw counter text with scale bounce ────────────────────────────────────
    ctx.save();
    // Pivot the scale transform around the counter's center point
    ctx.translate(cfg.x, cfg.y);
    ctx.scale(this._bounceScale, this._bounceScale);
    ctx.translate(-cfg.x, -cfg.y);

    ctx.font = this._fontStr;
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    // Purple glow behind text
    ctx.shadowColor = "rgba(168, 85, 247, 0.85)";
    ctx.shadowBlur = 24;

    // Deep-navy stroke for legibility on any background
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0A0A3A";
    ctx.strokeText(label, cfg.x, cfg.y);

    ctx.shadowBlur = 0;
    ctx.fillStyle = cfg.color;
    ctx.fillText(label, cfg.x, cfg.y);

    ctx.restore();
  }

  // ── Two-pass neon border rendering ────────────────────────────────────────────

  private _renderNeonBorder(ctx: CanvasRenderingContext2D): void {
    const cfg = this._neonCfg;

    // Accumulate gradient rotation angle each frame
    _gradAngle += cfg.rotationSpeed;

    const cx = cfg.canvasWidth * 0.5;
    const cy = cfg.canvasHeight * 0.5;
    const cosA = Math.cos(_gradAngle);
    const sinA = Math.sin(_gradAngle);

    // Gradient endpoints rotate around the canvas center
    const gx1 = cx + cosA * cfg.canvasWidth;
    const gy1 = cy + sinA * cfg.canvasHeight;
    const gx2 = cx - cosA * cfg.canvasWidth;
    const gy2 = cy - sinA * cfg.canvasHeight;

    const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2);
    const stops = cfg.gradientColors;
    const stopStep = 1 / Math.max(1, stops.length - 1);
    for (let s = 0; s < stops.length; s++) {
      grad.addColorStop(s * stopStep, stops[s]);
    }

    const bx = 2;
    const by = 2;
    const bw = cfg.canvasWidth - 4;
    const bh = cfg.canvasHeight - 4;
    const r = cfg.cornerRadius;

    // ── Pass 1: Thick blurred ambient drop-shadow layer ───────────────────────
    ctx.save();
    ctx.shadowColor = stops[0];
    ctx.shadowBlur = cfg.ambientBlur * 2.5;
    ctx.lineWidth = cfg.ambientStrokeWidth;
    ctx.strokeStyle = grad;
    ctx.beginPath();
    this._rrPath(ctx, bx, by, bw, bh, r);
    ctx.stroke();
    ctx.restore();

    // ── Pass 2: Sharp 4px inner gradient stroke ───────────────────────────────
    ctx.save();
    ctx.lineWidth = cfg.sharpStrokeWidth;
    ctx.strokeStyle = grad;
    ctx.shadowBlur = 10;
    ctx.shadowColor = stops[Math.floor(stops.length * 0.5)] ?? stops[0];
    ctx.beginPath();
    this._rrPath(ctx, bx, by, bw, bh, r);
    ctx.stroke();
    ctx.restore();
  }

  // Rounded-rect path — reuses the current path state (no Path2D allocation)
  private _rrPath(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number, r: number,
  ): void {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,       x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h,   x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,      y + h,   x, y + h - r,     r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x,      y,       x + r, y,          r);
    ctx.closePath();
  }

  // Thousand-separator formatter — no regex, no split/join
  private _formatNumber(n: number): string {
    const s = Math.floor(n).toString();
    let out = "";
    for (let i = 0; i < s.length; i++) {
      if (i > 0 && (s.length - i) % 3 === 0) out += ",";
      out += s[i];
    }
    return out;
  }

  private _buildFontStr(): string {
    return `bold ${this._counterCfg.fontSize}px ${this._counterCfg.fontFamily}`;
  }
}
