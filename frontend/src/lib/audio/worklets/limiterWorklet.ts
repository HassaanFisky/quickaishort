// @ts-nocheck — AudioWorkletProcessor not in TS 5.9.3 bundled lib.dom.d.ts
/**
 * Simple look-ahead limiter AudioWorkletProcessor.
 * Brick-wall peak limiter: gain reduction applied when signal exceeds threshold.
 * Uses a 2ms look-ahead buffer and 200ms release.
 */

const LOOK_AHEAD_SAMPLES = 88; // ~2ms at 44100 Hz
const RELEASE_COEFF = 0.999; // per-sample release (≈200ms half-life)

class LimiterWorkletProcessor extends AudioWorkletProcessor {
  private _threshold = 0.98; // linear peak ceiling
  private _gainReduction = 1.0;
  private _lookahead: Float32Array;
  private _writeIdx = 0;

  constructor() {
    super();
    this._lookahead = new Float32Array(LOOK_AHEAD_SAMPLES);
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.threshold !== undefined) this._threshold = e.data.threshold;
    };
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    for (let i = 0; i < input.length; i++) {
      const sample = input[i] ?? 0;

      // Compute peak in look-ahead window
      this._lookahead[this._writeIdx] = Math.abs(sample);
      this._writeIdx = (this._writeIdx + 1) % LOOK_AHEAD_SAMPLES;
      let peak = 0;
      for (let k = 0; k < LOOK_AHEAD_SAMPLES; k++) {
        if (this._lookahead[k] > peak) peak = this._lookahead[k];
      }

      // Attack: instantly reduce gain if peak would exceed threshold
      if (peak * this._gainReduction > this._threshold) {
        this._gainReduction = this._threshold / peak;
      }
      // Release: slowly return to unity
      this._gainReduction = Math.min(1.0, this._gainReduction / RELEASE_COEFF);

      output[i] = sample * this._gainReduction;
    }
    return true;
  }
}

registerProcessor("limiter-worklet", LimiterWorkletProcessor);
