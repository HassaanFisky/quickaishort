/**
 * Unsharp mask sharpen shader.
 * sharpened = original + (original - neighbourhood_avg) * amount
 *
 * Uniform: SharpenParams { amount: f32, _pad: vec3<f32> }
 */

export const SHARPEN_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct SharpenParams {
  amount: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var samp:   sampler;
@group(0) @binding(2) var<uniform> params: SharpenParams;

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
  let px = 1.0 / texSize;

  let center = textureSample(srcTex, samp, in.uv).rgb;
  let blur = (
    textureSample(srcTex, samp, in.uv + vec2(-px.x,  0.0)).rgb +
    textureSample(srcTex, samp, in.uv + vec2( px.x,  0.0)).rgb +
    textureSample(srcTex, samp, in.uv + vec2( 0.0, -px.y)).rgb +
    textureSample(srcTex, samp, in.uv + vec2( 0.0,  px.y)).rgb
  ) / 4.0;

  let sharpened = center + (center - blur) * params.amount;
  return vec4(clamp(sharpened, vec3(0.0), vec3(1.0)), 1.0);
}
`;
