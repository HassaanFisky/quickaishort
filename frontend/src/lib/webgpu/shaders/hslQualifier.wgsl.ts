/**
 * WGSL HSL qualifier — isolates a hue range, desaturates everything outside it.
 * Uniforms: hueCenter (0–360), hueWidth (0–180), satMin (0–1)
 */
export const HSL_QUALIFIER_WGSL = /* wgsl */ `
struct Uniforms {
  hueCenter: f32,
  hueWidth:  f32,
  satMin:    f32,
  _pad:      f32,
};

@group(0) @binding(0) var srcTex: texture_2d<f32>;
@group(0) @binding(1) var srcSmp: sampler;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn rgb_to_hsl(col: vec3<f32>) -> vec3<f32> {
  let maxC = max(col.r, max(col.g, col.b));
  let minC = min(col.r, min(col.g, col.b));
  let l    = (maxC + minC) * 0.5;
  let d    = maxC - minC;
  if (d < 0.0001) { return vec3(0.0, 0.0, l); }
  let s = select(d / (2.0 - maxC - minC), d / (maxC + minC), l < 0.5);
  var h = 0.0;
  if (maxC == col.r)      { h = (col.g - col.b) / d + select(6.0, 0.0, col.g >= col.b); }
  else if (maxC == col.g) { h = (col.b - col.r) / d + 2.0; }
  else                    { h = (col.r - col.g) / d + 4.0; }
  return vec3(h / 6.0 * 360.0, s, l);
}

fn hsl_qualify(col: vec3<f32>) -> vec3<f32> {
  let hsl  = rgb_to_hsl(col);
  let hue  = hsl.x;
  var diff = abs(hue - u.hueCenter);
  if (diff > 180.0) { diff = 360.0 - diff; }
  let inRange = diff <= u.hueWidth * 0.5;
  if (inRange) { return col; }
  let gray = dot(col, vec3(0.299, 0.587, 0.114));
  return mix(col, vec3(gray), max(0.0, 1.0 - hsl.y / max(u.satMin, 0.001)));
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
  let col = textureSample(srcTex, srcSmp, in.uv);
  return vec4(hsl_qualify(col.rgb), col.a);
}
`;
