/**
 * Downsample PCM to a fixed bar count for the editor audio lane.
 * Raw Float32Array must not live in Zustand (long-form RAM).
 */
export function computeWaveformPeaks(
  audioData: Float32Array,
  barCount = 120,
): number[] {
  if (!audioData.length || barCount <= 0) return [];
  const step = Math.floor(audioData.length / barCount) || 1;
  return Array.from({ length: barCount }, (_, i) => {
    const start = i * step;
    const end = Math.min(start + step, audioData.length);
    const stride = Math.max(1, Math.floor((end - start) / 50));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j += stride) {
      sum += Math.abs(audioData[j]);
      count++;
    }
    return count > 0 ? Math.max(0.01, Math.min(1, (sum / count) * 10)) : 0.01;
  });
}
