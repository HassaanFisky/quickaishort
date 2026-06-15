export interface BeatDetectionOptions {
  /** Sub-band: "bass" (80-200 Hz), "mid" (200-2kHz), "full" (all). Default: "bass" */
  band?: "bass" | "mid" | "full";
  /** Peak threshold, 0-1 relative to max energy. Default: 0.65 */
  threshold?: number;
  /** Min gap in seconds between beats. Default: 0.25 */
  minGapSec?: number;
}

/**
 * Runs offline beat detection on an AudioBuffer via energy-band analysis.
 * Returns an array of beat timestamps in seconds.
 */
export async function detectBeats(
  audioBuffer: AudioBuffer,
  options: BeatDetectionOptions = {}
): Promise<number[]> {
  const { band = "bass", threshold = 0.65, minGapSec = 0.25 } = options;

  const sr = audioBuffer.sampleRate;
  const frameSize = 512;
  const hopSize = 256;
  const numChannels = audioBuffer.numberOfChannels;

  // Mix down to mono
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) mono[i] += channelData[i] / numChannels;
  }

  // Offline biquad filtering based on band
  const offlineCtx = new OfflineAudioContext(1, mono.length, sr);
  const src = offlineCtx.createBuffer(1, mono.length, sr);
  src.getChannelData(0).set(mono);
  const srcNode = offlineCtx.createBufferSource();
  srcNode.buffer = src;

  let output: AudioNode;
  if (band === "bass") {
    const lp = offlineCtx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 200;
    srcNode.connect(lp);
    lp.connect(offlineCtx.destination);
    output = lp;
  } else if (band === "mid") {
    const bp = offlineCtx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1000;
    bp.Q.value = 0.5;
    srcNode.connect(bp);
    bp.connect(offlineCtx.destination);
    output = bp;
  } else {
    srcNode.connect(offlineCtx.destination);
    output = srcNode;
  }
  void output;

  srcNode.start();
  const rendered = await offlineCtx.startRendering();
  const filtered = rendered.getChannelData(0);

  // Compute RMS energy over hop windows
  const numFrames = Math.floor((filtered.length - frameSize) / hopSize) + 1;
  const energies = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sum = 0;
    for (let i = 0; i < frameSize; i++) {
      const v = filtered[start + i] ?? 0;
      sum += v * v;
    }
    energies[f] = Math.sqrt(sum / frameSize);
  }

  // Normalise and find peaks above threshold
  const maxE = Math.max(...energies);
  if (maxE === 0) return [];
  const norm = energies.map((e) => e / maxE);

  const beats: number[] = [];
  const minFrameGap = Math.ceil((minGapSec * sr) / hopSize);
  let lastBeatFrame = -minFrameGap;

  for (let f = 1; f < norm.length - 1; f++) {
    if (
      norm[f] > threshold &&
      norm[f] > norm[f - 1] &&
      norm[f] >= norm[f + 1] &&
      f - lastBeatFrame >= minFrameGap
    ) {
      beats.push((f * hopSize) / sr);
      lastBeatFrame = f;
    }
  }

  return beats;
}
