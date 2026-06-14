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

// ── 14. Slide Left ───────────────────────────────────────────────────────────
export const TRANSITION_SLIDE_LEFT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let ease = progress * progress * (3.0 - 2.0 * progress);
  let uvFrom = vec2(in.uv.x + ease, in.uv.y);
  let uvTo   = vec2(in.uv.x + ease - 1.0, in.uv.y);
  if (uvTo.x >= 0.0 && uvTo.x <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 15. Slide Right ──────────────────────────────────────────────────────────
export const TRANSITION_SLIDE_RIGHT = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let ease = progress * progress * (3.0 - 2.0 * progress);
  let uvFrom = vec2(in.uv.x - ease, in.uv.y);
  let uvTo   = vec2(in.uv.x - ease + 1.0, in.uv.y);
  if (uvTo.x >= 0.0 && uvTo.x <= 1.0) {
    return textureSample(toTex, srcSmp, uvTo);
  }
  return textureSample(fromTex, srcSmp, uvFrom);
}
`;

// ── 16. Radial Wipe ──────────────────────────────────────────────────────────
export const TRANSITION_RADIAL_WIPE = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let center  = vec2<f32>(0.5, 0.5);
  let delta   = in.uv - center;
  let angle   = atan2(delta.y, delta.x) + 3.14159265;
  let sweepRad = progress * 6.28318530;
  if (angle < sweepRad) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 17. Diamond Wipe ─────────────────────────────────────────────────────────
export const TRANSITION_DIAMOND_WIPE = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let c    = abs(in.uv - vec2(0.5));
  let dist = c.x + c.y;
  if (dist < progress * 0.7071) {
    return textureSample(toTex, srcSmp, in.uv);
  }
  return textureSample(fromTex, srcSmp, in.uv);
}
`;

// ── 18. Pixelate ─────────────────────────────────────────────────────────────
export const TRANSITION_PIXELATE = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let ease = progress * progress * (3.0 - 2.0 * progress);
  let maxBlocks = 32.0;
  let blocks = max(1.0, maxBlocks * (1.0 - abs(ease - 0.5) * 2.0));
  let pixUV = floor(in.uv * blocks) / blocks + 0.5 / blocks;
  let a = textureSample(fromTex, srcSmp, pixUV);
  let b = textureSample(toTex,   srcSmp, pixUV);
  return mix(a, b, step(0.5, ease));
}
`;

// ── 19. Glitch ───────────────────────────────────────────────────────────────
export const TRANSITION_GLITCH = TRANSITION_PRELUDE + /* wgsl */ `
fn hash(p: vec2<f32>) -> f32 {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let ease   = smoothstep(0.0, 1.0, progress);
  let sliceY = floor(in.uv.y * 20.0) / 20.0;
  let shift  = (hash(vec2(sliceY, ease)) - 0.5) * ease * 0.08;
  let uvA    = vec2(fract(in.uv.x + shift), in.uv.y);
  let uvB    = vec2(fract(in.uv.x - shift), in.uv.y);
  let rA = textureSample(fromTex, srcSmp, vec2(uvA.x + ease * 0.01, uvA.y)).r;
  let gA = textureSample(fromTex, srcSmp, uvA).g;
  let bA = textureSample(fromTex, srcSmp, vec2(uvA.x - ease * 0.01, uvA.y)).b;
  let rB = textureSample(toTex, srcSmp, vec2(uvB.x + ease * 0.01, uvB.y)).r;
  let gB = textureSample(toTex, srcSmp, uvB).g;
  let bB = textureSample(toTex, srcSmp, vec2(uvB.x - ease * 0.01, uvB.y)).b;
  let colA = vec4(rA, gA, bA, 1.0);
  let colB = vec4(rB, gB, bB, 1.0);
  return mix(colA, colB, ease);
}
`;

// ── 20. Fade Through White ────────────────────────────────────────────────────
export const TRANSITION_FADE_WHITE = TRANSITION_PRELUDE + /* wgsl */ `
@fragment
fn fs_main(in: VsOut) -> @location(0) vec4<f32> {
  let halfway = abs(progress - 0.5) * 2.0;
  let col = select(
    textureSample(toTex,   srcSmp, in.uv),
    textureSample(fromTex, srcSmp, in.uv),
    progress < 0.5
  );
  return mix(vec4(1.0), col, halfway);
}
`;

// ── Registry ─────────────────────────────────────────────────────────────────
export const WGSL_TRANSITIONS: Record<string, string> = {
  "Cross-Dissolve":  TRANSITION_CROSSDISSOLVE,
  "Wipe Left":       TRANSITION_WIPE_LEFT,
  "Wipe Right":      TRANSITION_WIPE_RIGHT,
  "Wipe Up":         TRANSITION_WIPE_UP,
  "Wipe Down":       TRANSITION_WIPE_DOWN,
  "Zoom In":         TRANSITION_ZOOM_IN,
  "Dip to Black":    TRANSITION_DIP_BLACK,
  "Push Left":       TRANSITION_PUSH_LEFT,
  "Push Right":      TRANSITION_PUSH_RIGHT,
  "Push Up":         TRANSITION_PUSH_UP,
  "Push Down":       TRANSITION_PUSH_DOWN,
  "Iris":            TRANSITION_IRIS,
  "Cross Zoom":      TRANSITION_CROSS_ZOOM,
  "Slide Left":      TRANSITION_SLIDE_LEFT,
  "Slide Right":     TRANSITION_SLIDE_RIGHT,
  "Radial Wipe":     TRANSITION_RADIAL_WIPE,
  "Diamond Wipe":    TRANSITION_DIAMOND_WIPE,
  "Pixelate":        TRANSITION_PIXELATE,
  "Glitch":          TRANSITION_GLITCH,
  "Fade to White":   TRANSITION_FADE_WHITE,
};

export type TransitionName = keyof typeof WGSL_TRANSITIONS;
