// Module 3 — Alpha-Composited Liquid Text Motion Shader
// Renders a multi-octave sine/cosine wave exclusively inside text glyph alpha
// using source-in compositing. A high-intensity glow pass is drawn along the
// wave's edge using canvas shadow projection. Every draw call is wrapped in
// save/restore to prevent context state leakage.

export interface LiquidTextConfig {
  text: string;
  /** Pixel X center of the rendered text block on the target canvas */
  centerX: number;
  /** Pixel Y center of the rendered text block on the target canvas */
  centerY: number;
  fontSize: number;        // px, default 64
  fontFamily: string;
  strokeColor: string;     // deep navy, default "#0A0A3A"
  strokeWidth: number;     // px, default 3
  /** Wave parameters */
  amplitude: number;       // primary wave amplitude in px, default 18
  speed: number;           // radians per ms, default 0.003
  frequency: number;       // primary radians per px, default 0.012
  amplitude2: number;      // second harmonic amplitude, default 8
  frequency2: number;      // second harmonic radians per px, default 0.022
  /** Gradient stops for the wave fill */
  waveColor1: string;      // default "#00FF88"
  waveColor2: string;      // default "#00AAFF"
  /** Glow stroke along wave edge */
  glowColor: string;       // default "#00FFAA"
  glowBlur: number;        // shadow blur radius, default 25
  /** Slow-filling-up oscillation period in ms */
  fillPeriodMs: number;    // default 4000
}

// Padding around text on the offscreen canvas (provides room for stroke + blur)
const PAD = 48;

// ── LiquidTextShader ──────────────────────────────────────────────────────────
export class LiquidTextShader {
  private _cfg: LiquidTextConfig;
  private _fontStr: string;

  // Offscreen canvas used as the text-alpha mask source
  private _offCanvas: HTMLCanvasElement;
  private _offCtx: CanvasRenderingContext2D;
  private _offW = 0;
  private _offH = 0;

  // Cached signature to detect when the offscreen must be rebuilt
  private _cachedText = "";
  private _cachedFont = "";

  // Pre-allocated gradient (rebuilt when offscreen dimensions change)
  private _waveGrad: CanvasGradient | null = null;
  private _cachedGradH = 0;

  // Per-column temporaries declared here — zero GC inside render loop
  private _col = 0;
  private _waveY = 0;
  private _fillOffset = 0;

  constructor(config?: Partial<LiquidTextConfig>) {
    this._cfg = {
      text: "GOING VIRAL",
      centerX: 540,
      centerY: 960,
      fontSize: 64,
      fontFamily: "Inter, Impact, sans-serif",
      strokeColor: "#0A0A3A",
      strokeWidth: 3,
      amplitude: 18,
      speed: 0.003,
      frequency: 0.012,
      amplitude2: 8,
      frequency2: 0.022,
      waveColor1: "#00FF88",
      waveColor2: "#00AAFF",
      glowColor: "#00FFAA",
      glowBlur: 25,
      fillPeriodMs: 4000,
      ...config,
    };
    this._fontStr = this._buildFontStr();

    this._offCanvas = document.createElement("canvas");
    const ctx = this._offCanvas.getContext("2d");
    if (!ctx) throw new Error("LiquidTextShader: cannot acquire 2D context for offscreen canvas");
    this._offCtx = ctx;
  }

  updateConfig(patch: Partial<LiquidTextConfig>): void {
    this._cfg = { ...this._cfg, ...patch };
    this._fontStr = this._buildFontStr();
    // Force offscreen rebuild on next render call
    this._cachedText = "";
    this._cachedFont = "";
  }

  // nowMs = absolute wall-clock timestamp in milliseconds
  render(ctx: CanvasRenderingContext2D, nowMs: number): void {
    const cfg = this._cfg;

    // ── Step 1: Rebuild offscreen mask when text or font changes ─────────────
    if (cfg.text !== this._cachedText || this._fontStr !== this._cachedFont) {
      this._rebuildOffscreen(ctx);
    }

    const offW = this._offW;
    const offH = this._offH;
    if (offW === 0 || offH === 0) return;

    // ── Step 2: Clear offscreen then draw the stroke + chroma fill ───────────
    this._offCtx.clearRect(0, 0, offW, offH);

    this._offCtx.save();
    this._offCtx.font = this._fontStr;
    this._offCtx.textBaseline = "middle";
    this._offCtx.textAlign = "center";

    // Stroke under the fill for crisp edges (wider stroke is drawn first)
    this._offCtx.lineWidth = cfg.strokeWidth * 2;
    this._offCtx.strokeStyle = cfg.strokeColor;
    this._offCtx.lineJoin = "round";
    this._offCtx.strokeText(cfg.text, offW * 0.5, offH * 0.5);

    // Solid chroma-key green fill — this becomes the alpha channel for compositing
    this._offCtx.fillStyle = "#00FF00";
    this._offCtx.fillText(cfg.text, offW * 0.5, offH * 0.5);

    this._offCtx.restore();

    // ── Step 3: Compute fill offset (slow oscillating liquid level) ───────────
    const fillRatio = 0.5 + 0.5 * Math.sin((nowMs / cfg.fillPeriodMs) * Math.PI * 2);
    this._fillOffset = PAD + (offH - PAD * 2) * (1 - fillRatio);

    // ── Step 4: Rebuild wave gradient if height changed ───────────────────────
    if (this._cachedGradH !== offH || this._waveGrad === null) {
      this._waveGrad = this._offCtx.createLinearGradient(0, PAD, 0, offH - PAD);
      this._waveGrad.addColorStop(0, cfg.waveColor1);
      this._waveGrad.addColorStop(1, cfg.waveColor2);
      this._cachedGradH = offH;
    }

    // ── Step 5: Draw wave fill — source-in so it only paints inside text alpha
    this._offCtx.save();
    this._offCtx.globalCompositeOperation = "source-in";

    this._offCtx.beginPath();
    this._offCtx.moveTo(0, offH);

    for (this._col = 0; this._col <= offW; this._col += 2) {
      this._waveY =
        cfg.amplitude * Math.sin(nowMs * cfg.speed + this._col * cfg.frequency) +
        cfg.amplitude2 * Math.cos(nowMs * cfg.speed * 1.7 + this._col * cfg.frequency2) +
        this._fillOffset;

      if (this._col === 0) {
        this._offCtx.moveTo(this._col, this._waveY);
      } else {
        this._offCtx.lineTo(this._col, this._waveY);
      }
    }

    this._offCtx.lineTo(offW, offH);
    this._offCtx.lineTo(0, offH);
    this._offCtx.closePath();
    this._offCtx.fillStyle = this._waveGrad;
    this._offCtx.fill();

    this._offCtx.restore();

    // ── Step 6: Glow pass — bright stroke along the wave's edge line ─────────
    this._offCtx.save();
    this._offCtx.globalCompositeOperation = "source-atop";
    this._offCtx.shadowBlur = cfg.glowBlur;
    this._offCtx.shadowColor = cfg.glowColor;
    this._offCtx.strokeStyle = cfg.glowColor;
    this._offCtx.lineWidth = 2;

    this._offCtx.beginPath();
    for (this._col = 0; this._col <= offW; this._col += 2) {
      this._waveY =
        cfg.amplitude * Math.sin(nowMs * cfg.speed + this._col * cfg.frequency) +
        cfg.amplitude2 * Math.cos(nowMs * cfg.speed * 1.7 + this._col * cfg.frequency2) +
        this._fillOffset;

      if (this._col === 0) {
        this._offCtx.moveTo(this._col, this._waveY);
      } else {
        this._offCtx.lineTo(this._col, this._waveY);
      }
    }
    this._offCtx.stroke();
    this._offCtx.restore();

    // ── Step 7: Composite offscreen result onto the main canvas ───────────────
    ctx.save();
    ctx.drawImage(
      this._offCanvas,
      0, 0, offW, offH,
      cfg.centerX - offW * 0.5,
      cfg.centerY - offH * 0.5,
      offW,
      offH,
    );
    ctx.restore();
  }

  destroy(): void {
    this._waveGrad = null;
    this._cachedText = "";
    this._cachedFont = "";
  }

  // ── Private ────────────────────────────────────────────────────────────────────

  private _rebuildOffscreen(mainCtx: CanvasRenderingContext2D): void {
    // Measure with the main context (shares the same font rendering engine)
    mainCtx.font = this._fontStr;
    const m = mainCtx.measureText(this._cfg.text);
    const w = Math.ceil(m.width) + PAD * 2;
    const h = Math.ceil(this._cfg.fontSize * 1.6) + PAD * 2;

    this._offCanvas.width = w;
    this._offCanvas.height = h;
    this._offW = w;
    this._offH = h;

    this._cachedText = this._cfg.text;
    this._cachedFont = this._fontStr;
    this._waveGrad = null; // Gradient must be rebuilt for new dimensions
  }

  private _buildFontStr(): string {
    return `bold ${this._cfg.fontSize}px ${this._cfg.fontFamily}`;
  }
}
