/**
 * WGSL transition shaders — 13 transitions.
 * Each shader expects bindings: fromTex (2d), toTex (2d), srcSmp (sampler),
 * and a uniform buffer with a single f32 `progress` (0→1).
 */

const TRANSITION_PRELUDE = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@group(0) @binding(0) var fromTex: texture_2d<f32>;
@group(0) @binding(1) var toTex:   texture_2d<f32>;
@group(0) @binding(2) var srcSmp:  sampler;
@group(0) @binding(3) var<uniform> progress: f32;

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
`;

// ── 1. Cross-Dissolve (Fade) ─────────────────────────────────────────────────
export const TRANSITION_CROSSDISSOLVE = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let a = textureSample(fromTex, srcSmp, in.uv);
  let b = textureSample(toTex,   srcSmp, in.uv);
  return mix(a, b, progress);
}
`;

// ── 2. Wipe Left ─────────────────────────────────────────────────────────────
export const TRANSITION_WIPE_LEFT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (in.uv.x < progress) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 3. Wipe Right ────────────────────────────────────────────────────────────
export const TRANSITION_WIPE_RIGHT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (in.uv.x > 1.0 - progress) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 4. Wipe Up ───────────────────────────────────────────────────────────────
export const TRANSITION_WIPE_UP = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (in.uv.y > 1.0 - progress) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 5. Wipe Down ─────────────────────────────────────────────────────────────
export const TRANSITION_WIPE_DOWN = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  if (in.uv.y < progress) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 6. Zoom In ───────────────────────────────────────────────────────────────
export const TRANSITION_ZOOM_IN = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let scale = 1.0 + progress * 0.3;
  let uv2 = (in.uv - vec2(0.5)) / scale + vec2(0.5);
  let a = textureSample(fromTex, srcSmp, uv2);
  let b = textureSample(toTex,   srcSmp, in.uv);
  return mix(a, b, progress);
}
`;

// ── 7. Dip to Black ──────────────────────────────────────────────────────────
export const TRANSITION_DIP_BLACK = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let halfway = abs(progress - 0.5) * 2.0;
  let col = select(
    textureSample(toTex,   srcSmp, in.uv),
    textureSample(fromTex, srcSmp, in.uv),
    progress < 0.5
  );
  return col * halfway;
}
`;

// ── 8. Push Left ─────────────────────────────────────────────────────────────
export const TRANSITION_PUSH_LEFT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let uvFrom = vec2(in.uv.x + progress, in.uv.y);
  let uvTo   = vec2(in.uv.x + progress - 1.0, in.uv.y);
  if (uvTo.x >= 0.0 && uvTo.x <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 9. Push Right ────────────────────────────────────────────────────────────
export const TRANSITION_PUSH_RIGHT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let uvFrom = vec2(in.uv.x - progress, in.uv.y);
  let uvTo   = vec2(in.uv.x - progress + 1.0, in.uv.y);
  if (uvTo.x >= 0.0 && uvTo.x <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 10. Push Up ──────────────────────────────────────────────────────────────
export const TRANSITION_PUSH_UP = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let uvFrom = vec2(in.uv.x, in.uv.y - progress);
  let uvTo   = vec2(in.uv.x, in.uv.y - progress + 1.0);
  if (uvTo.y >= 0.0 && uvTo.y <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 11. Push Down ────────────────────────────────────────────────────────────
export const TRANSITION_PUSH_DOWN = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let uvFrom = vec2(in.uv.x, in.uv.y + progress);
  let uvTo   = vec2(in.uv.x, in.uv.y + progress - 1.0);
  if (uvTo.y >= 0.0 && uvTo.y <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 12. Iris Circle Wipe ─────────────────────────────────────────────────────
export const TRANSITION_IRIS = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let center = vec2<f32>(0.5, 0.5);
  let dist = distance(in.uv, center);
  // max distance from center to corner = sqrt(0.5)
  let maxDist = 0.7071;
  if (dist < progress * maxDist) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 13. Cross Zoom ───────────────────────────────────────────────────────────
export const TRANSITION_CROSS_ZOOM = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let ease = progress * progress * (3.0 - 2.0 * progress); // smoothstep
  // outgoing: zoom in (scale up)
  let scaleOut = 1.0 + ease * 0.6;
  let uvOut = (in.uv - vec2(0.5)) / scaleOut + vec2(0.5);
  // incoming: zoom out from big to normal
  let scaleIn = 1.6 - ease * 0.6;
  let uvIn  = (in.uv - vec2(0.5)) / scaleIn + vec2(0.5);
  let a = textureSample(fromTex, srcSmp, uvOut);
  let b = textureSample(toTex,   srcSmp, uvIn);
  return mix(a, b, ease);
}
`;

// ── Registry ─────────────────────────────────────────────────────────────────
export const WGSL_TRANSITIONS: Record<string, string> = {
  "Cross-Dissolve": TRANSITION_CROSSDISSOLVE,
  "Wipe Left":      TRANSITION_WIPE_LEFT,
  "Wipe Right":     TRANSITION_WIPE_RIGHT,
  "Wipe Up":        TRANSITION_WIPE_UP,
  "Wipe Down":      TRANSITION_WIPE_DOWN,
  "Zoom In":        TRANSITION_ZOOM_IN,
  "Dip to Black":   TRANSITION_DIP_BLACK,
  "Push Left":      TRANSITION_PUSH_LEFT,
  "Push Right":     TRANSITION_PUSH_RIGHT,
  "Push Up":        TRANSITION_PUSH_UP,
  "Push Down":      TRANSITION_PUSH_DOWN,
  "Iris":           TRANSITION_IRIS,
  "Cross Zoom":     TRANSITION_CROSS_ZOOM,
};

export type TransitionName = keyof typeof WGSL_TRANSITIONS;
