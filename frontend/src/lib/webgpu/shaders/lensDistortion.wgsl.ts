/**
 * WGSL lens distortion — barrel (k1 > 0) or pincushion (k1 < 0) distortion.
 * Uniforms: k1 (-1 to 1), k2 (-0.5 to 0.5)
 */
export const LENS_DISTORTION_WGSL = /* wgsl */ `
struct Uniforms {
  k1:   f32,
  k2:   f32,
  _p1:  f32,
  _p2:  f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSmp: sampler;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn lens_distort(uv: vec2<f32>) -> vec2<f32> {
  let centered = uv - vec2(0.5);
  let r2 = dot(centered, centered);
  let distorted = centered * (1.0 + u.k1 * r2 + u.k2 * r2 * r2);
  return distorted + vec2(0.5);
}

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
  let distUV = lens_distort(in.uv);
  let oob    = any(distUV < vec2(0.0)) || any(distUV > vec2(1.0));
  if (oob) { return vec4(0.0, 0.0, 0.0, 1.0); }
  return textureSample(srcTex, srcSmp, distUV);
}
`;
