/**
 * Converts transcript JSON chunks to SRT format.
 * Filters chunks to be within the start/end time range relative to the cut.
 */
import { TranscriptChunk } from "@/types/pipeline";

export function generateSRT(
  chunks: TranscriptChunk[],
  startTime: number,
  endTime: number,
): string {
  let srt = "";
  let counter = 1;

  chunks.forEach((chunk) => {
    // Check overlap
    if (chunk.end > startTime && chunk.start < endTime) {
      // Adjust timing to be relative to the new video start (t=0)
      const relativeStart = Math.max(0, chunk.start - startTime);
      const relativeEnd = Math.min(endTime - startTime, chunk.end - startTime);

      // Format timestamp: HH:MM:SS,ms
      const startStr = formatSRTTime(relativeStart);
      const endStr = formatSRTTime(relativeEnd);

      srt += `${counter}\n${startStr} --> ${endStr}\n${chunk.text}\n\n`;
      counter++;
    }
  });

  return srt;
}

function formatSRTTime(seconds: number): string {
  const date = new Date(0);
  date.setMilliseconds(seconds * 1000);
  // Extract HH:MM:SS,ms
  const iso = date.toISOString().substr(11, 12);
  return iso.replace(".", ",");
}
