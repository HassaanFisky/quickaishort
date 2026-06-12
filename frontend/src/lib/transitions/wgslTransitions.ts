// @ts-nocheck
/**
 * 7 cinematic WGSL transition shaders for WebGPU canvas compositing.
 * Each transition takes fromTex (t=0) → toTex (t=1) over progress 0–1.
 */

// ─── WGSL shader templates ────────────────────────────────────────────────────

const TRANSITION_VERT = /* wgsl */`
@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 4>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>(1.0,  1.0),
  );
  return vec4<f32>(pos[vi], 0.0, 1.0);
}
`;

const TRANSITION_COMMON = /* wgsl */`
@group(0) @binding(0) var fromTex: texture_2d<f32>;
@group(0) @binding(1) var toTex:   texture_2d<f32>;
@group(0) @binding(2) var samp:    sampler;
@group(0) @binding(3) var<uniform> progress: f32;

fn uv(pos: vec4<f32>) -> vec2<f32> {
  return vec2<f32>(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
}
`;

export const WGSL_TRANSITIONS: Record<string, string> = {
  fade: TRANSITION_COMMON + /* wgsl */`
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  let a = textureSample(fromTex, samp, u);
  let b = textureSample(toTex, samp, u);
  return mix(a, b, progress);
}`,

  dissolve: TRANSITION_COMMON + /* wgsl */`
fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2<f32>(127.1, 311.7))) * 43758.5453);
}
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  let noise = hash(floor(u * 64.0));
  return select(textureSample(fromTex, samp, u),
                textureSample(toTex, samp, u),
                noise < progress);
}`,

  wipe_left: TRANSITION_COMMON + /* wgsl */`
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  return select(textureSample(fromTex, samp, u),
                textureSample(toTex, samp, u),
                u.x < progress);
}`,

  wipe_right: TRANSITION_COMMON + /* wgsl */`
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  return select(textureSample(fromTex, samp, u),
                textureSample(toTex, samp, u),
                u.x > (1.0 - progress));
}`,

  zoom_in: TRANSITION_COMMON + /* wgsl */`
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  let scale = 1.0 + progress * 0.5;
  let su = (u - 0.5) / scale + 0.5;
  let a = textureSample(fromTex, samp, su);
  let b = textureSample(toTex, samp, u);
  return mix(a, b, progress);
}`,

  zoom_out: TRANSITION_COMMON + /* wgsl */`
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let u = uv(pos);
  let scale = 1.0 + (1.0 - progress) * 0.5;
  let su = (u - 0.5) / scale + 0.5;
  let b = textureSample(toTex, samp, su);
  let a = textureSample(fromTex, samp, u);
  return mix(a, b, progress);
}`,

  glitch: TRANSITION_COMMON + /* wgsl */`
fn rng(seed: f32) -> f32 {
  return fract(sin(seed * 127.1 + 311.7) * 43758.5453);
}
@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  var u = uv(pos);
  let band = floor(u.y * 20.0);
  let shift = (rng(band + floor(progress * 30.0)) - 0.5) * 0.08 * progress;
  u.x = fract(u.x + shift);
  let a = textureSample(fromTex, samp, u);
  let b = textureSample(toTex, samp, u);
  return mix(a, b, progress);
}`,
};

export type TransitionName = keyof typeof WGSL_TRANSITIONS;

// ─── TransitionPipeline ───────────────────────────────────────────────────────

export class TransitionPipeline {
  private _device: GPUDevice;
  private _pipelines = new Map<string, GPURenderPipeline>();
  private _sampler: GPUSampler;

  private constructor(device: GPUDevice) {
    this._device = device;
    this._sampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
  }

  static async isSupported(): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  }

  static async create(): Promise<TransitionPipeline> {
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter!.requestDevice();
    return new TransitionPipeline(device);
  }

  private async _getPipeline(name: TransitionName): Promise<GPURenderPipeline> {
    if (this._pipelines.has(name)) return this._pipelines.get(name)!;
    const frag = WGSL_TRANSITIONS[name];
    const pipeline = await this._device.createRenderPipelineAsync({
      layout: "auto",
      vertex: { module: this._device.createShaderModule({ code: TRANSITION_VERT }), entryPoint: "vs_main" },
      fragment: {
        module: this._device.createShaderModule({ code: frag }),
        entryPoint: "fs_main",
        targets: [{ format: "bgra8unorm" }],
      },
      primitive: { topology: "triangle-strip" },
    });
    this._pipelines.set(name, pipeline);
    return pipeline;
  }

  async render(
    name: TransitionName,
    fromTex: GPUTexture,
    toTex: GPUTexture,
    outputTex: GPUTexture,
    progress: number,
  ): Promise<void> {
    const pipeline = await this._getPipeline(name);
    const uniformBuf = this._device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this._device.queue.writeBuffer(uniformBuf, 0, new Float32Array([progress]));

    const bg = this._device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: fromTex.createView() },
        { binding: 1, resource: toTex.createView() },
        { binding: 2, resource: this._sampler },
        { binding: 3, resource: { buffer: uniformBuf } },
      ],
    });

    const enc = this._device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: outputTex.createView(), loadOp: "clear", storeOp: "store", clearValue: [0, 0, 0, 1] }],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bg);
    pass.draw(4);
    pass.end();
    this._device.queue.submit([enc.finish()]);
  }

  destroy(): void {
    this._pipelines.clear();
  }
}
