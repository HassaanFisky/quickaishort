// @ts-nocheck — AudioWorkletProcessor not in TS 5.9.3 bundled lib.dom.d.ts
/**
 * RNNoise AudioWorkletProcessor wrapper.
 * Loads rnnoise.wasm (copied to /public/wasm/) and processes 480-sample frames
 * using the RNNoise noise suppression algorithm.
 *
 * RNNoise is © 2018 Mozilla Corporation, licensed under BSD 3-clause.
 * Attribution: https://github.com/mozilla/rnnoise
 */

const FRAME_SIZE = 480;

class RNNoiseWorkletProcessor extends AudioWorkletProcessor {
  private _rnnoiseModule: WebAssembly.Instance | null = null;
  private _state: number = 0;
  private _inputBuf: number = 0;
  private _outputBuf: number = 0;
  private _ready = false;
  private _bypass = false;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === "bypass") this._bypass = e.data.enabled;
    };
    this._loadWasm().catch(() => { this._bypass = true; });
  }

  private async _loadWasm(): Promise<void> {
    const resp = await fetch("/wasm/rnnoise.wasm");
    const buf = await resp.arrayBuffer();
    const mod = await WebAssembly.instantiate(buf, { env: {} });
    this._rnnoiseModule = mod.instance;
    const exports = mod.instance.exports as {
      rnnoise_create: () => number;
      rnnoise_process_frame: (state: number, out: number, input: number) => number;
      malloc: (size: number) => number;
      free: (ptr: number) => void;
      memory: WebAssembly.Memory;
    };
    this._state = exports.rnnoise_create();
    this._inputBuf = exports.malloc(FRAME_SIZE * 4);
    this._outputBuf = exports.malloc(FRAME_SIZE * 4);
    this._ready = true;
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0]?.[0];
    const output = outputs[0]?.[0];
    if (!input || !output) return true;

    if (this._bypass || !this._ready || !this._rnnoiseModule) {
      output.set(input);
      return true;
    }

    const exports = this._rnnoiseModule.exports as {
      rnnoise_process_frame: (state: number, out: number, input: number) => number;
      memory: WebAssembly.Memory;
    };
    const mem = new Float32Array(exports.memory.buffer);
    const inOff = this._inputBuf / 4;
    const outOff = this._outputBuf / 4;

    // RNNoise expects 16-bit range (±32768)
    for (let i = 0; i < FRAME_SIZE; i++) {
      mem[inOff + i] = (input[i] ?? 0) * 32768;
    }
    exports.rnnoise_process_frame(this._state, this._outputBuf, this._inputBuf);
    for (let i = 0; i < FRAME_SIZE; i++) {
      output[i] = mem[outOff + i] / 32768;
    }
    return true;
  }
}

registerProcessor("rnnoise-worklet", RNNoiseWorkletProcessor);
