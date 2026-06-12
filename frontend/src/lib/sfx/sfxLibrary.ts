"use client";

export type SfxCategory = "impact" | "whoosh" | "glitch" | "ambient" | "transition" | "ui";

export interface SfxEntry {
  id: string;
  name: string;
  category: SfxCategory;
  durationMs: number;
}

/** Bundled SFX catalog — audio served from /sfx/ public folder. */
export const SFX_CATALOG: SfxEntry[] = [
  { id: "impact-thud",      name: "Impact Thud",       category: "impact",     durationMs: 400  },
  { id: "impact-boom",      name: "Impact Boom",       category: "impact",     durationMs: 900  },
  { id: "whoosh-fast",      name: "Whoosh Fast",       category: "whoosh",     durationMs: 300  },
  { id: "whoosh-slow",      name: "Whoosh Slow",       category: "whoosh",     durationMs: 700  },
  { id: "glitch-digital",   name: "Glitch Digital",    category: "glitch",     durationMs: 500  },
  { id: "glitch-stutter",   name: "Glitch Stutter",    category: "glitch",     durationMs: 350  },
  { id: "ambient-hum",      name: "Ambient Hum",       category: "ambient",    durationMs: 4000 },
  { id: "transition-swipe", name: "Transition Swipe",  category: "transition", durationMs: 250  },
  { id: "ui-click",         name: "UI Click",          category: "ui",         durationMs: 80   },
  { id: "ui-pop",           name: "UI Pop",            category: "ui",         durationMs: 120  },
];

let _audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!_audioCtx) _audioCtx = new AudioContext();
  return _audioCtx;
}

const _bufferCache = new Map<string, AudioBuffer>();

export async function playSfx(id: string, volume = 1): Promise<void> {
  const entry = SFX_CATALOG.find((e) => e.id === id);
  if (!entry) return;

  const ctx = getCtx();
  if (ctx.state === "suspended") await ctx.resume();

  let buffer = _bufferCache.get(id);
  if (!buffer) {
    const resp = await fetch(`/sfx/${id}.mp3`);
    if (!resp.ok) return;
    buffer = await ctx.decodeAudioData(await resp.arrayBuffer());
    _bufferCache.set(id, buffer);
  }

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
