/**
 * WGSL color correction fragment shader.
 * Implements: exposure, contrast, saturation (Rec.709), CDL Lift/Gamma/Gain/Offset,
 * and optional 3D LUT trilinear interpolation.
 *
 * Uniform layout (128 bytes, std140):
 *   offset 0:  exposure       f32
 *   offset 4:  contrast       f32
 *   offset 8:  saturation     f32
 *   offset 12: lut_enabled    u32
 *   offset 16: lift           vec3<f32> + _pad
 *   offset 32: gamma          vec3<f32> + _pad
 *   offset 48: gain           vec3<f32> + _pad
 *   offset 64: offset_vec     vec3<f32> + _pad
 *   offset 80: lut_intensity  f32 + 3×_pad
 */

export const COLOR_CORRECTION_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

struct ColorParams {
  exposure:     f32,
  contrast:     f32,
  saturation:   f32,
  lut_enabled:  u32,
  lift:         vec3<f32>,
  _pad0:        f32,
  gamma:        vec3<f32>,
  _pad1:        f32,
  gain:         vec3<f32>,
  _pad2:        f32,
  offset_vec:   vec3<f32>,
  lut_intensity:f32,
};

@group(0) @binding(0) var srcSmp: sampler;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: ColorParams;
@group(0) @binding(3) var lutTex: texture_3d<f32>;

// Rec.709 luma coefficients
const REC709_LUMA = vec3<f32>(0.2126, 0.7152, 0.0722);

@vertex
fn vs_main(@builtin(vertex_index) i: u32) -> VsOut {
  var positions = array<vec2<f32>, 3>(
    vec2(-1.0, -1.0),
    vec2( 3.0, -1.0),
    vec2(-1.0,  3.0),
  );
  var uvs = array<vec2<f32>, 3>(
    vec2(0.0, 1.0),
    vec2(2.0, 1.0),
    vec2(0.0,-1.0),
  );
  var out: VsOut;
  out.pos = vec4(positions[i], 0.0, 1.0);
  out.uv  = uvs[i];
  return out;
}

fn apply_cdl(c: vec3<f32>) -> vec3<f32> {
  // Slope (gain) + Lift → SL
  let sl = c * (params.gain - params.lift) + params.lift;
  // Power (1/gamma)
  let safe_gamma = max(params.gamma, vec3<f32>(0.001));
  let powered = pow(max(sl, vec3<f32>(0.0)), vec3<f32>(1.0) / safe_gamma);
  // Offset
  return powered + params.offset_vec;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  var col = textureSample(srcTex, srcSmp, in.uv).rgb;

  // 1. Exposure — multiply by pow(2, exposure_ev)
  col = col * pow(2.0, params.exposure);

  // 2. CDL: Lift / Gamma / Gain / Offset
  col = apply_cdl(col);

  // 3. Contrast — pivot at 0.5
  col = (col - vec3<f32>(0.5)) * params.contrast + vec3<f32>(0.5);

  // 4. Saturation — Rec.709 luma-preserving desaturate/resaturate
  let luma = dot(col, REC709_LUMA);
  col = mix(vec3<f32>(luma), col, params.saturation);

  // 5. Optional 3D LUT — trilinear interpolation via GPU sampler
  if params.lut_enabled == 1u {
    let lut_dim = f32(textureDimensions(lutTex).x);
    let lut_uv  = (clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)) * (lut_dim - 1.0) + 0.5) / lut_dim;
    let lut_col = textureSample(lutTex, srcSmp, lut_uv).rgb;
    col = mix(col, lut_col, params.lut_intensity);
  }

  return vec4<f32>(clamp(col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

/** Default neutral ColorParams uniform values (128 bytes). */
export function defaultColorParamsBuffer(): Float32Array {
  const buf = new Float32Array(32); // 128 bytes
  buf[0] = 0.0;  // exposure
  buf[1] = 1.0;  // contrast
  buf[2] = 1.0;  // saturation
  buf[3] = 0.0;  // lut_enabled (u32 stored as f32 for simplicity — cast in pipeline)
  // lift (4:7) = 0,0,0,0
  // gamma (8:11) = 1,1,1,0
  buf[8] = 1.0; buf[9] = 1.0; buf[10] = 1.0;
  // gain (12:15) = 1,1,1,0
  buf[12] = 1.0; buf[13] = 1.0; buf[14] = 1.0;
  // offset (16:19) = 0,0,0,0
  // lut_intensity (20) = 1.0
  buf[20] = 1.0;
  return buf;
}
