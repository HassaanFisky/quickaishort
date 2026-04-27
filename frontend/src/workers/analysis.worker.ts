interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface ClipSuggestion {
  id: string;
  start: number;
  end: number;
  confidence: number;
  scores: {
    audioPeak: number;
    motion: number;
    speechDensity: number;
  };
  reason: string;
  viralReasoning?: string;
  suggestedCaptions?: string[];
  automation_status?: "Ready" | "Pending";
}

function analyzeAudioPeaks(
  audioData: Float32Array,
  sampleRate: number,
): number[] {
  const windowSize = sampleRate * 2; // 2-second windows
  const peaks: number[] = [];

  for (let i = 0; i < audioData.length; i += windowSize) {
    const window = audioData.slice(i, i + windowSize);
    const rms = Math.sqrt(
      window.reduce((sum, val) => sum + val * val, 0) / window.length,
    );
    peaks.push(rms);
  }

  return peaks;
}

function analyzeSpeechDensity(
  transcript: TranscriptSegment[],
  duration: number,
): number[] {
  const windowSize = 2; // 2-second windows
  const windows = Math.ceil(duration / windowSize);
  const density: number[] = new Array(windows).fill(0);

  for (const segment of transcript) {
    const startWindow = Math.floor(segment.start / windowSize);
    const endWindow = Math.floor(segment.end / windowSize);
    const wordCount = segment.text.split(/\s+/).length;
    const segmentDuration = Math.max(0.1, segment.end - segment.start);
    const wordsPerSecond = wordCount / segmentDuration;

    for (let w = startWindow; w <= endWindow && w < windows; w++) {
      density[w] = Math.max(density[w], wordsPerSecond);
    }
  }

  return density;
}

function generateSuggestions(
  peaks: number[],
  speechDensity: number[],
  duration: number,
): ClipSuggestion[] {
  const windowSize = 2;
  const targetClipLength = 30; // 30 seconds
  const suggestions: ClipSuggestion[] = [];

  // Normalize scores
  const maxPeak = Math.max(...peaks, 0.0001);
  const maxDensity = Math.max(...speechDensity, 0.0001);

  const normalizedPeaks = peaks.map((p) => p / maxPeak);
  const normalizedDensity = speechDensity.map((d) => d / maxDensity);

  // Score each possible clip
  const clipScores: Array<{
    start: number;
    score: number;
    scores: {
      audioPeak: number;
      motion: number;
      speechDensity: number;
    };
  }> = [];

  for (let start = 0; start < duration - targetClipLength; start += 5) {
    const startWindow = Math.floor(start / windowSize);
    const endWindow = Math.floor((start + targetClipLength) / windowSize);

    const windowPeaks = normalizedPeaks.slice(startWindow, endWindow);
    const windowDensity = normalizedDensity.slice(startWindow, endWindow);

    const avgPeak = windowPeaks.length
      ? windowPeaks.reduce((a, b) => a + b, 0) / windowPeaks.length
      : 0;
    const avgDensity = windowDensity.length
      ? windowDensity.reduce((a, b) => a + b, 0) / windowDensity.length
      : 0;
    const peakVariance = windowPeaks.length
      ? Math.max(...windowPeaks) - Math.min(...windowPeaks)
      : 0;

    const compositeScore =
      avgPeak * 0.3 + avgDensity * 0.4 + peakVariance * 0.3;

    clipScores.push({
      start,
      score: compositeScore,
      scores: {
        audioPeak: avgPeak,
        motion: peakVariance,
        speechDensity: avgDensity,
      },
    });
  }

  // Sort and pick top 5 non-overlapping
  clipScores.sort((a, b) => b.score - a.score);

  for (const clip of clipScores) {
    if (suggestions.length >= 5) break;

    const overlaps = suggestions.some(
      (s) => Math.abs(s.start - clip.start) < targetClipLength,
    );

    if (!overlaps) {
      const reasoning = generateViralReasoning(clip.scores);
      suggestions.push({
        id: `clip-${suggestions.length + 1}`,
        start: clip.start,
        end: clip.start + targetClipLength,
        confidence: Math.round(clip.score * 100),
        scores: clip.scores,
        reason: generateReason(clip.scores),
        viralReasoning: reasoning.explanation,
        suggestedCaptions: reasoning.captions,
        automation_status: clip.score > 0.7 ? "Ready" : "Pending",
      });
    }
  }

  return suggestions.sort((a, b) => a.start - b.start);
}

function generateReason(scores: {
  audioPeak: number;
  motion: number;
  speechDensity: number;
}): string {
  const reasons: string[] = [];
  if (scores.audioPeak > 0.7) reasons.push("high audio energy");
  if (scores.speechDensity > 0.7) reasons.push("dense speech");
  if (scores.motion > 0.5) reasons.push("dynamic moments");
  return reasons.length > 0
    ? `Contains ${reasons.join(", ")}`
    : "Balanced engagement";
}

function generateViralReasoning(scores: {
  audioPeak: number;
  motion: number;
  speechDensity: number;
}): { explanation: string; captions: string[] } {
  const hooks = [
    "You won't believe what happens next!",
    "The truth about this will shock you.",
    "Why everyone is talking about this moment.",
    "This is exactly why he's the best.",
    "Wait for the ending, it's worth it."
  ];

  let explanation = "This segment shows high retention potential due to ";
  if (scores.audioPeak > 0.8) {
    explanation += "a significant emotional peak in the audio, signaling a viral 'hook'.";
  } else if (scores.speechDensity > 0.8) {
    explanation += "an information-dense delivery that is perfect for rapid-fire shorts.";
  } else if (scores.motion > 0.6) {
    explanation += "dynamic visual motion which captures viewer attention immediately.";
  } else {
    explanation += "a balanced mix of engagement factors optimized for the algorithm.";
  }

  const selectedHooks = hooks
    .sort(() => 0.5 - Math.random())
    .slice(0, 2);

  return {
    explanation,
    captions: selectedHooks
  };
}

interface CutSegment {
  start: number;
  end: number;
  type: "keep" | "silence";
}

function detectSilence(
  audioData: Float32Array,
  sampleRate: number,
  thresholdDb: number = -45,
  minSilenceDurationMs: number = 500,
): CutSegment[] {
  const threshold = Math.pow(10, thresholdDb / 20);
  const minSilenceSamples = (minSilenceDurationMs / 1000) * sampleRate;

  const segments: CutSegment[] = [];
  let isSilence = false;
  let silenceStart = 0;

  // Create windows for analysis (e.g., 100ms) to smooth out instant drops
  const windowSize = Math.floor(sampleRate / 10);
  const windows = Math.floor(audioData.length / windowSize);

  let currentStart = 0;

  // We will iterate sample by sample or window by window?
  // Window by window is faster and sufficient for "Jump Cut".
  // Let's use a smaller window like 10ms for precision (sampleRate / 100)
  const preciseWindow = Math.floor(sampleRate / 100);

  for (let i = 0; i < audioData.length; i += preciseWindow) {
    const end = Math.min(i + preciseWindow, audioData.length);
    const chunk = audioData.slice(i, end);

    // Calculate RMS of chunk
    let sum = 0;
    for (let j = 0; j < chunk.length; j++) {
      sum += chunk[j] * chunk[j];
    }
    const rms = Math.sqrt(sum / chunk.length);

    const isBelowThreshold = rms < threshold;

    // Simple state machine
    if (isBelowThreshold && !isSilence) {
      isSilence = true;
      silenceStart = i;
    } else if (!isBelowThreshold && isSilence) {
      // End of silence
      isSilence = false;
      const durationSamples = i - silenceStart;

      if (durationSamples >= minSilenceSamples) {
        // It was a valid silence
        // Push previous KEEP segment if exists
        if (silenceStart > currentStart) {
          segments.push({
            start: currentStart / sampleRate,
            end: silenceStart / sampleRate,
            type: "keep",
          });
        }
        // Push SILENCE segment
        segments.push({
          start: silenceStart / sampleRate,
          end: i / sampleRate,
          type: "silence",
        });
        currentStart = i;
      } else {
        // Ignored silence (too short), treated as keep
      }
    }
  }

  // Final segment
  if (currentStart < audioData.length) {
    segments.push({
      start: currentStart / sampleRate,
      end: audioData.length / sampleRate,
      type: "keep", // Should we check if the tail is silence?
    });
  }

  return segments;
}

self.onmessage = async (e: MessageEvent) => {
  try {
    const { type, payload } = e.data;

    if (type === "analyze") {
      const { audioData, transcript, duration, sampleRate } = payload;

      self.postMessage({
        type: "status",
        stage: "process",
        payload: { message: "Analyzing audio peaks..." },
      });

      const peaks = analyzeAudioPeaks(audioData, sampleRate);

      self.postMessage({
        type: "progress",
        stage: "process",
        payload: { progress: 50, message: "Analyzing speech density..." },
      });

      const speechDensity = analyzeSpeechDensity(transcript, duration);

      self.postMessage({
        type: "progress",
        stage: "process",
        payload: { progress: 80, message: "Generating suggestions..." },
      });

      const suggestions = generateSuggestions(peaks, speechDensity, duration);

      self.postMessage({
        type: "complete",
        stage: "process",
        payload: { suggestions },
      });
    }

    if (type === "detect_silence") {
      const { audioData, sampleRate, thresholdDb, minSilenceDurationMs } =
        payload;

      self.postMessage({
        type: "status",
        stage: "process",
        payload: { message: "Detecting silence..." },
      });

      const segments = detectSilence(
        audioData,
        sampleRate,
        thresholdDb,
        minSilenceDurationMs,
      );

      self.postMessage({
        type: "silence_detected", // New message type
        stage: "complete",
        payload: { segments },
      });
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      stage: "process",
      payload: {
        message: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
};
