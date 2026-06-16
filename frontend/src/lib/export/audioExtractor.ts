/**
 * Extracts raw audio samples from a video element's source.
 * Uses fetch + AudioContext.decodeAudioData for cross-origin compatible extraction.
 */
export async function extractAudioBuffer(
  videoSrc: string,
  options: { sampleRate?: number; startSec?: number; endSec?: number } = {},
): Promise<AudioBuffer | null> {
  const { sampleRate = 48000, startSec = 0, endSec } = options;

  try {
    const response = await fetch(videoSrc, { mode: "cors" });
    if (!response.ok) return null;

    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new OfflineAudioContext(2, sampleRate * 10, sampleRate);
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    if (startSec > 0 || endSec != null) {
      const start = Math.floor(startSec * audioBuffer.sampleRate);
      const end = endSec != null ? Math.floor(endSec * audioBuffer.sampleRate) : audioBuffer.length;
      const length = end - start;
      if (length <= 0) return null;

      const trimmed = new OfflineAudioContext(audioBuffer.numberOfChannels, length, audioBuffer.sampleRate);
      const src = trimmed.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(trimmed.destination);
      src.start(0, startSec, endSec ? endSec - startSec : undefined);

      return await trimmed.startRendering();
    }

    return audioBuffer;
  } catch {
    // Cross-origin or decode failure — return null (video-only export)
    return null;
  }
}

export interface AudioChunk {
  data: Float32Array; // planar layout: all of channel 0, then all of channel 1, ...
  timestamp: number; // microseconds
  numberOfFrames: number;
}

/**
 * Converts an AudioBuffer to planar Float32Array chunks for AudioEncoder
 * ("f32-planar" AudioData format). Always emits `targetChannels` channels —
 * mono sources are duplicated across channels so the output matches the
 * encoder's fixed channel-count configuration.
 */
export function audioBufferToChunks(
  buffer: AudioBuffer,
  chunkSize: number = 1024,
  targetChannels: number = 2,
): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  const sampleRate = buffer.sampleRate;
  const sourceChannels = buffer.numberOfChannels;

  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    const frames = Math.min(chunkSize, buffer.length - offset);
    const planar = new Float32Array(frames * targetChannels);

    for (let ch = 0; ch < targetChannels; ch++) {
      const sourceCh = Math.min(ch, sourceChannels - 1);
      const channelData = buffer.getChannelData(sourceCh);
      planar.set(channelData.subarray(offset, offset + frames), ch * frames);
    }

    chunks.push({
      data: planar,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      numberOfFrames: frames,
    });
  }

  return chunks;
}
