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

  try {
    let arrayBuffer: ArrayBuffer;
    if (typeof source === "string") {
      let response: Response;
      try {
        response = await fetch(source, { signal });
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") throw err;
        throw new Error("Network Error: Could not retrieve audio stream from backend. Backend might be unreachable.");
      }

      if (!response.ok) {
        let errMsg = `Audio fetch failed: HTTP ${response.status}`;
        try {
          const errJson = await response.json() as { detail?: string; message?: string };
          errMsg = errJson.detail || errJson.message || errMsg;
        } catch { /* ignore parse failure, keep status-based message */ }
        throw new Error(errMsg);
      }
      arrayBuffer = await response.arrayBuffer();
    } else {
      arrayBuffer = await source.arrayBuffer();
    }

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const audioData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;

    return { audioData, sampleRate, duration };
  } finally {
    // Always release the AudioContext — it is only used for decoding, not playback.
    audioContext.close().catch(() => {});
  }
}
