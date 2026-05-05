/**
 * Utility to extract audio data from a video file safely in the browser.
 */
declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export async function extractAudioData(
  source: File | string,
  signal?: AbortSignal,
): Promise<{ audioData: Float32Array; sampleRate: number; duration: number }> {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  });

  let arrayBuffer: ArrayBuffer;
  if (typeof source === "string") {
    const response = await fetch(source, { signal });
    if (!response.ok) {
      let errMsg = `Audio fetch failed: HTTP ${response.status}`;
      try {
        const errJson = await response.json();
        errMsg = errJson.message || errMsg;
      } catch { /* ignore parse failure, keep status-based message */ }
      throw new Error(errMsg);
    }
    arrayBuffer = await response.arrayBuffer();
  } else {
    arrayBuffer = await source.arrayBuffer();
  }

  // Note: decodeAudioData accepts an ArrayBuffer
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // For Whisper, we generally want mono 16kHz
  const audioData = audioBuffer.getChannelData(0); // Get first channel
  const duration = audioBuffer.duration;
  const sampleRate = audioBuffer.sampleRate;

  return { audioData, sampleRate, duration };
}
