// @ts-nocheck
/**
 * Chroma Key WGSL shader — removes a target color (default: green) from video.
 * Uses YCbCr color space distance for robust keying under varying lighting.
 *
 * Uniform: ChromaKeyParams {
 *   key_cb: f32,       // Cb component of key color (green default ≈ 43.6)
 *   key_cr: f32,       // Cr component of key color (green default ≈ 21.1)
 *   tolerance: f32,    // How close a pixel must be to key color to be removed (0-1, default 0.3)
 *   softness: f32,     // Edge feather width (0-1, default 0.1)
 *   spill: f32,        // Spill suppression amount (0-1, default 0.5)
 *   enabled: u32,      // 0 = off, 1 = on
 *   _pad0: f32,
 *   _pad1: f32,
 * }
 */

export const CHROMA_KEY_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct ChromaKeyParams {
  key_cb:     f32,
  key_cr:     f32,
  tolerance:  f32,
  softness:   f32,
  spill:      f32,
  enabled:    u32,
  _pad0:      f32,
  _pad1:      f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp:   sampler;
@group(0) @binding(2) var<uniform> params: ChromaKeyParams;

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  var pos = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0),
  );
  var uv = array<vec2<f32>, 3>(
    vec2(0.0, 1.0), vec2(2.0, 1.0), vec2(0.0, -1.0),
  );
  var out: VsOut;
  out.pos = vec4(pos[i], 0.0, 1.0);
  out.uv  = uv[i];
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  var col = textureSample(srcTex, samp, in.uv);

  if params.enabled == 0u {
    return col;
  }

  // Convert to YCbCr
  let r = col.r;
  let g = col.g;
  let b = col.b;
  let cb = -0.168736 * r - 0.331264 * g + 0.5 * b;
  let cr = 0.5 * r - 0.418688 * g - 0.081312 * b;

  // Distance from key color in CbCr space
  let key_cb_norm = (params.key_cb - 128.0) / 128.0;
  let key_cr_norm = (params.key_cr - 128.0) / 128.0;
  let dist = distance(vec2(cb, cr), vec2(key_cb_norm, key_cr_norm));

  // Alpha based on tolerance + softness
  let inner = params.tolerance;
  let outer = params.tolerance + params.softness;
  let alpha = smoothstep(inner, outer, dist);

  // Spill suppression — reduce the green channel in partially keyed areas
  var result = col.rgb;
  if alpha < 1.0 {
    let spillAmount = (1.0 - alpha) * params.spill;
    result.g = result.g - spillAmount * max(0.0, result.g - max(result.r, result.b));
  }

  return vec4(result, alpha * col.a);
}
`;

// Default green screen key color in CbCr space.
// Pure green (0, 255, 0): Cb ≈ 43.6, Cr ≈ 21.1
export const DEFAULT_CHROMA_KEY_CB = 43.6;
export const DEFAULT_CHROMA_KEY_CR = 21.1;
