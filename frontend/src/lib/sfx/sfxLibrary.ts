"use client";

export type SfxCategory = "impact" | "whoosh" | "glitch" | "ambient" | "transition" | "ui";

export interface SfxEntry {
  id: string;
  name: string;
  category: SfxCategory;
  durationMs: number;
}

/** Bundled SFX catalog — prefers /sfx/{id}.mp3; synthesizes if asset missing. */
export const SFX_CATALOG: SfxEntry[] = [
  { id: "impact-thud", name: "Impact Thud", category: "impact", durationMs: 400 },
  { id: "impact-boom", name: "Impact Boom", category: "impact", durationMs: 900 },
  { id: "whoosh-fast", name: "Whoosh Fast", category: "whoosh", durationMs: 300 },
  { id: "whoosh-slow", name: "Whoosh Slow", category: "whoosh", durationMs: 700 },
  { id: "glitch-digital", name: "Glitch Digital", category: "glitch", durationMs: 500 },
  { id: "glitch-stutter", name: "Glitch Stutter", category: "glitch", durationMs: 350 },
  { id: "ambient-hum", name: "Ambient Hum", category: "ambient", durationMs: 4000 },
  { id: "transition-swipe", name: "Transition Swipe", category: "transition", durationMs: 250 },
  { id: "ui-click", name: "UI Click", category: "ui", durationMs: 80 },
  { id: "ui-pop", name: "UI Pop", category: "ui", durationMs: 120 },
];

export function getSfxEntry(id: string): SfxEntry | undefined {
  return SFX_CATALOG.find((e) => e.id === id);
}

let _audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

const _bufferCache = new Map<string, AudioBuffer>();

/** Cost-zero preview SFX when MP3 assets are not shipped yet. */
function synthesizeBuffer(entry: SfxEntry, ctx: AudioContext): AudioBuffer {
  const durationSec = Math.max(0.05, entry.durationMs / 1000);
  const frames = Math.ceil(ctx.sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  const category = entry.category;
  for (let i = 0; i < frames; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-3.2 * (t / durationSec));
    let sample = 0;
    if (category === "impact") {
      sample = Math.sin(2 * Math.PI * (90 + t * 40) * t) * env;
      sample += (Math.random() * 2 - 1) * 0.25 * env;
    } else if (category === "whoosh") {
      sample = (Math.random() * 2 - 1) * env * (0.4 + 0.6 * (t / durationSec));
    } else if (category === "glitch") {
      sample = (Math.random() * 2 - 1) * (i % 32 < 16 ? env : env * 0.2);
    } else if (category === "ambient") {
      sample =
        Math.sin(2 * Math.PI * 110 * t) * 0.15 * env +
        Math.sin(2 * Math.PI * 165 * t) * 0.08 * env;
    } else if (category === "transition") {
      sample = Math.sin(2 * Math.PI * (400 - t * 500) * t) * env;
    } else {
      sample = Math.sin(2 * Math.PI * 880 * t) * env * 0.5;
    }
    data[i] = Math.max(-1, Math.min(1, sample));
  }
  return buffer;
}

export async function resolveSfxBuffer(id: string): Promise<AudioBuffer | null> {
  const entry = getSfxEntry(id);
  if (!entry) return null;

  const ctx = getCtx();
  let buffer = _bufferCache.get(id);
  if (buffer) return buffer;

  try {
    const resp = await fetch(`/sfx/${id}.mp3`);
    if (resp.ok) {
      buffer = await ctx.decodeAudioData(await resp.arrayBuffer());
      _bufferCache.set(id, buffer);
      return buffer;
    }
  } catch {
    // Fall through to synthesis — no MP3 in public/sfx yet.
  }

  buffer = synthesizeBuffer(entry, ctx);
  _bufferCache.set(id, buffer);
  return buffer;
}

export async function playSfx(id: string, volume = 1): Promise<void> {
  const ctx = getCtx();
  if (ctx.state === "suspended") await ctx.resume();
  const buffer = await resolveSfxBuffer(id);
  if (!buffer) return;

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(2, volume));
  src.connect(gain).connect(ctx.destination);
  src.start();
}

export function searchSfx(query: string): SfxEntry[] {
  const q = query.toLowerCase();
  return SFX_CATALOG.filter(
    (e) => e.name.toLowerCase().includes(q) || e.category.includes(q),
  );
}
