/**
 * WGSL strobe effect — flashes frame to white at a configurable rate.
 * Uniforms: time (seconds), rate (flashes/sec), intensity (0–1)
 */
export const STROBE_WGSL = /* wgsl */ `
struct Uniforms {
  time:      f32,
  rate:      f32,
  intensity: f32,
  _pad:      f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSmp: sampler;
@group(0) @binding(2) var<uniform> u: Uniforms;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0)       uv:  vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  var pos = array<vec2<f32>, 3>(vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0, 3.0));
  var uv  = array<vec2<f32>, 3>(vec2(0.0, 1.0),  vec2(2.0, 1.0), vec2(0.0, -1.0));
  var o: VsOut;
  o.pos = vec4(pos[i], 0.0, 1.0);
  o.uv  = uv[i];
  return o;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let col   = textureSample(srcTex, srcSmp, in.uv);
  let phase = fract(u.time * u.rate);
  let flash = step(0.5, phase) * u.intensity;
  return vec4(mix(col.rgb, vec3(1.0), flash), col.a);
}
`;
