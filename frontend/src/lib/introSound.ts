/**
 * Generates a sharp blade-slice sound using Web Audio.
 * Called by CinematicIntro when the sweep phase triggers.
 * No external audio file required — fully synthetic.
 */
export function playBladeSlice(): void {
  try {
    const ctx = new AudioContext();

    // White noise burst (0.15 s) — the "slice" character
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.15), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length * 0.2));
    }
    noise.buffer = buf;

    // Highpass filter — makes it sharp, not bassy
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 2000;

    // Gain envelope — fast attack, fast decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    noise.connect(hp);
    hp.connect(gain);
    gain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.2);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Silently fail — sound is best-effort
  }
}
