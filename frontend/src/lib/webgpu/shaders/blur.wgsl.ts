/**
 * Two-pass separable Gaussian blur.
 * Pass 1: direction = (1, 0) — horizontal
 * Pass 2: direction = (0, 1) — vertical
 *
 * Uniform: BlurParams { direction: vec2<f32>, radius: f32, _pad: f32 }
 */

export const BLUR_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct BlurParams {
  direction: vec2<f32>,
  radius:    f32,
  _pad:      f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp:   sampler;
@group(0) @binding(2) var<uniform> params: BlurParams;

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
  let texSize = vec2<f32>(textureDimensions(srcTex));
  let radius = i32(params.radius);

  var color = vec4<f32>(0.0);
  var totalWeight = 0.0;

  for (var i = -radius; i <= radius; i++) {
    let offset = vec2<f32>(f32(i)) * params.direction / texSize;
    let sigma2 = params.radius * params.radius * 0.16;
    let weight = exp(-0.5 * (f32(i) * f32(i)) / sigma2);
    color += textureSample(srcTex, samp, in.uv + offset) * weight;
    totalWeight += weight;
  }

  return color / totalWeight;
}
`;
