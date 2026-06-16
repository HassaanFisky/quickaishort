// @ts-nocheck — WebGPU types (GPUDevice, GPUCanvasContext, GPUTextureUsage etc.)
// are not yet in TypeScript's bundled lib.dom.d.ts. Add @webgpu/types to
// devDependencies when upgrading TS toolchain, then remove this directive.
/**
 * WebGPU compositor — passthrough render pipeline for video frame preview.
 * Requires navigator.gpu (Chrome 113+, Chromium-based browsers only).
 */

const WGSL_SHADER = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var pos = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0),
  );
  var uv = array<vec2<f32>, 3>(
    vec2(0.0, 1.0),
    vec2(2.0, 1.0),
    vec2(0.0, -1.0),
  );
  var out: VsOut;
  out.pos = vec4(pos[i], 0.0, 1.0);
  out.uv  = uv[i];
  return out;
}

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSmp: sampler;

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  return textureSample(srcTex, srcSmp, in.uv);
}
`;

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn";

// Canvas 2D globalCompositeOperation mapping
export const BLEND_MODE_MAP: Record<BlendMode, GlobalCompositeOperation> = {
  normal: "source-over",
  multiply: "multiply",
  screen: "screen",
  overlay: "overlay",
  darken: "darken",
  lighten: "lighten",
  "color-dodge": "color-dodge" as GlobalCompositeOperation,
  "color-burn": "color-burn" as GlobalCompositeOperation,
};

export interface LayerTransform {
  x: number; // 0-1, position
  y: number;
  width: number; // 0-1, scale
  height: number;
  opacity: number; // 0-1
  rotation: number; // degrees
}

export class WebGpuCompositor {
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private sampler: GPUSampler | null = null;
  private format: GPUTextureFormat = "bgra8unorm";

  static async isSupported(): Promise<boolean> {
    try {
      if (typeof navigator === "undefined" || !navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }

  async init(canvas: HTMLCanvasElement): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("WebGPU: no adapter available");
    this.device = await adapter.requestDevice();

    this.context = canvas.getContext("webgpu") as GPUCanvasContext | null;
    if (!this.context) throw new Error("WebGPU: could not get GPUCanvasContext");

    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "premultiplied",
    });

    const module = this.device.createShaderModule({ code: WGSL_SHADER });

    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: { module, entryPoint: "vs" },
      fragment: {
        module,
        entryPoint: "fs",
        targets: [{ format: this.format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.sampler = this.device.createSampler({
      magFilter: "linear",
      minFilter: "linear",
    });
  }

  async drawVideoFrame(source: HTMLVideoElement | VideoFrame): Promise<void> {
    if (!this.device || !this.context || !this.pipeline || !this.sampler) return;

    const width =
      source instanceof VideoFrame ? source.displayWidth : source.videoWidth;
    const height =
      source instanceof VideoFrame ? source.displayHeight : source.videoHeight;
    if (!width || !height) return;

    const texture = this.device.createTexture({
      size: [width, height, 1],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.device.queue.copyExternalImageToTexture(
      { source, flipY: false },
      { texture },
      [width, height],
    );

    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: texture.createView() },
        { binding: 1, resource: this.sampler },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    texture.destroy();
  }

  /**
   * Draws a video frame onto a caller-owned canvas-2D context with transform,
   * opacity, and blend mode — used to layer multiple tracks (V2 over V1) during
   * export. Takes its own 2D context rather than `this.context` because a
   * canvas already configured for "webgpu" cannot also serve a "2d" context.
   * WebGPU multi-pass layering is a future optimization; this is the MVP path.
   */
  async compositeLayer(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    source: HTMLVideoElement | VideoFrame | HTMLCanvasElement,
    transform: LayerTransform,
    blendMode: BlendMode = "normal",
  ): Promise<void> {
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    if (!canvasWidth || !canvasHeight) return;

    const srcWidth =
      source instanceof VideoFrame ? source.displayWidth : (source as HTMLVideoElement).videoWidth || source.width;
    const srcHeight =
      source instanceof VideoFrame ? source.displayHeight : (source as HTMLVideoElement).videoHeight || source.height;
    if (!srcWidth || !srcHeight) return;

    const destX = transform.x * canvasWidth;
    const destY = transform.y * canvasHeight;
    const destWidth = transform.width * canvasWidth;
    const destHeight = transform.height * canvasHeight;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, transform.opacity));
    ctx.globalCompositeOperation = BLEND_MODE_MAP[blendMode];
    ctx.translate(destX + destWidth / 2, destY + destHeight / 2);
    if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
    ctx.drawImage(source as CanvasImageSource, -destWidth / 2, -destHeight / 2, destWidth, destHeight);
    ctx.restore();
  }

  dispose(): void {
    this.pipeline = null;
    this.sampler = null;
    if (this.context) {
      try {
        this.context.unconfigure();
      } catch {
        // ignore — context may already be lost
      }
      this.context = null;
    }
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }
}
