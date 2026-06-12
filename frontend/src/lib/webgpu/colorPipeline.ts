// @ts-nocheck — WebGPU types (GPUDevice, GPUTexture, …) are not in TS 5.9.3 bundled lib.dom.d.ts
import {
  COLOR_CORRECTION_WGSL,
  defaultColorParamsBuffer,
} from "./shaders/colorCorrection.wgsl";

export interface ColorAdjustments {
  exposure?: number;       // EV stops, default 0
  contrast?: number;       // multiplier around 0.5, default 1
  saturation?: number;     // 0 = grey, 1 = original, default 1
  lift?: [number, number, number];    // CDL lift per-channel, default [0,0,0]
  gamma?: [number, number, number];   // CDL gamma per-channel, default [1,1,1]
  gain?: [number, number, number];    // CDL gain per-channel, default [1,1,1]
  offset?: [number, number, number];  // CDL offset per-channel, default [0,0,0]
  lutUrl?: string | null;
  lutIntensity?: number;   // 0–1, default 1
}

interface LutCache {
  url: string;
  texture: GPUTexture;
  size: number;
}

export class ColorPipeline {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline | null = null;
  private uniformBuf: GPUBuffer | null = null;
  private neutralLut: GPUTexture | null = null;
  private lutCache: LutCache | null = null;
  private sampler: GPUSampler | null = null;

  constructor(device: GPUDevice) {
    this.device = device;
  }

  static async isSupported(): Promise<boolean> {
    if (!navigator?.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter != null;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    const dev = this.device;

    this.sampler = dev.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });

    this.neutralLut = this._createNeutralLut(2);

    this.uniformBuf = dev.createBuffer({
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const module = dev.createShaderModule({ code: COLOR_CORRECTION_WGSL });

    const bgl = dev.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "2d" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float", viewDimension: "3d" } },
      ],
    });

    this.pipeline = dev.createRenderPipeline({
      layout: dev.createPipelineLayout({ bindGroupLayouts: [bgl] }),
      vertex: { module, entryPoint: "vs_main" },
      fragment: {
        module,
        entryPoint: "fs_main",
        targets: [{ format: "rgba8unorm" }],
      },
      primitive: { topology: "triangle-list" },
    });
  }

  /** Run color correction on srcTexture → outTexture (same dimensions). */
  async process(
    srcTexture: GPUTexture,
    adj: ColorAdjustments
  ): Promise<GPUTexture> {
    if (!this.pipeline || !this.uniformBuf || !this.sampler) {
      throw new Error("ColorPipeline not initialized — call init() first");
    }
    const dev = this.device;

    // Upload uniforms
    const uniforms = this._buildUniformData(adj);
    dev.queue.writeBuffer(this.uniformBuf, 0, uniforms);

    // Resolve LUT texture
    const lutTex = adj.lutUrl
      ? await this._getLutTexture(adj.lutUrl)
      : (this.neutralLut as GPUTexture);

    // Output texture
    const outTex = dev.createTexture({
      size: [srcTexture.width, srcTexture.height],
      format: "rgba8unorm",
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });

    const bg = dev.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: srcTexture.createView() },
        { binding: 2, resource: { buffer: this.uniformBuf } },
        { binding: 3, resource: lutTex.createView() },
      ],
    });

    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{
        view: outTex.createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bg);
    pass.draw(3);
    pass.end();
    dev.queue.submit([enc.finish()]);

    return outTex;
  }

  destroy(): void {
    this.uniformBuf?.destroy();
    this.neutralLut?.destroy();
    this.lutCache?.texture.destroy();
    this.uniformBuf = null;
    this.neutralLut = null;
    this.lutCache = null;
    this.pipeline = null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _buildUniformData(adj: ColorAdjustments): Float32Array {
    const buf = defaultColorParamsBuffer();
    buf[0] = adj.exposure ?? 0;
    buf[1] = adj.contrast ?? 1;
    buf[2] = adj.saturation ?? 1;
    // lut_enabled stored as bit in buf[3]
    const u32view = new Uint32Array(buf.buffer);
    u32view[3] = adj.lutUrl ? 1 : 0;

    const lift   = adj.lift   ?? [0, 0, 0];
    const gamma  = adj.gamma  ?? [1, 1, 1];
    const gain   = adj.gain   ?? [1, 1, 1];
    const offset = adj.offset ?? [0, 0, 0];

    buf[4] = lift[0];  buf[5] = lift[1];  buf[6] = lift[2];
    buf[8] = gamma[0]; buf[9] = gamma[1]; buf[10] = gamma[2];
    buf[12] = gain[0]; buf[13] = gain[1]; buf[14] = gain[2];
    buf[16] = offset[0]; buf[17] = offset[1]; buf[18] = offset[2];
    buf[20] = adj.lutIntensity ?? 1;
    return buf;
  }

  private _createNeutralLut(size: number): GPUTexture {
    const tex = this.device.createTexture({
      size: [size, size, size],
      format: "rgba8unorm",
      dimension: "3d",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    // Identity LUT: pixel[r,g,b] = (r/(s-1), g/(s-1), b/(s-1), 1)
    const data = new Uint8Array(size * size * size * 4);
    let i = 0;
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          data[i++] = Math.round((r / (size - 1)) * 255);
          data[i++] = Math.round((g / (size - 1)) * 255);
          data[i++] = Math.round((b / (size - 1)) * 255);
          data[i++] = 255;
        }
      }
    }
    this.device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: size * 4, rowsPerImage: size },
      [size, size, size]
    );
    return tex;
  }

  private async _getLutTexture(url: string): Promise<GPUTexture> {
    if (this.lutCache?.url === url) return this.lutCache.texture;
    this.lutCache?.texture.destroy();

    const resp = await fetch(url);
    const text = await resp.text();
    const { data, size } = this._parseCube(text);

    const tex = this.device.createTexture({
      size: [size, size, size],
      format: "rgba8unorm",
      dimension: "3d",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture(
      { texture: tex },
      data,
      { bytesPerRow: size * 4, rowsPerImage: size },
      [size, size, size]
    );
    this.lutCache = { url, texture: tex, size };
    return tex;
  }

  private _parseCube(text: string): { data: Uint8Array; size: number } {
    let size = 17;
    const entries: number[] = [];
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (line.startsWith("LUT_3D_SIZE")) {
        size = parseInt(line.split(/\s+/)[1], 10);
      } else if (line && !line.startsWith("#") && !line.startsWith("TITLE") && !line.startsWith("DOMAIN")) {
        const parts = line.split(/\s+/);
        if (parts.length >= 3) {
          entries.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
        }
      }
    }
    const data = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < size * size * size; i++) {
      data[i * 4 + 0] = Math.round(Math.min(1, Math.max(0, entries[i * 3 + 0] ?? 0)) * 255);
      data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, entries[i * 3 + 1] ?? 0)) * 255);
      data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, entries[i * 3 + 2] ?? 0)) * 255);
      data[i * 4 + 3] = 255;
    }
    return { data, size };
  }
}
