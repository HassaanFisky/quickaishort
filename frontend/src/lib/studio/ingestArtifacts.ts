/**
 * M2 — Persist browser analysis artifacts so re-ingest skips Whisper + /api/analyze.
 * Uses existing idbStorage (no new infra). Never stores raw PCM.
 */

import { idbDelete, idbLoad, idbSave } from "@/lib/project/idbStorage";
import type { Clip, CutSegment, Transcript } from "@/types/pipeline";

const KEY_PREFIX = "ingest_artifact:v1:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ARTIFACT_VERSION = 1;

export interface IngestAnalysisArtifact {
  version: number;
  fingerprint: string;
  savedAt: number;
  duration: number;
  transcript: Transcript;
  suggestions: Clip[];
  silenceSegments: CutSegment[];
  waveformPeaks: number[] | null;
  title?: string | null;
}

function keyFor(fingerprint: string): string {
  return `${KEY_PREFIX}${fingerprint}`;
}

export async function loadIngestArtifact(
  fingerprint: string,
): Promise<IngestAnalysisArtifact | null> {
  try {
    const raw = await idbLoad<IngestAnalysisArtifact>(keyFor(fingerprint));
    if (!raw || raw.version !== ARTIFACT_VERSION) return null;
    if (raw.fingerprint !== fingerprint) return null;
    if (Date.now() - raw.savedAt > TTL_MS) {
      void idbDelete(keyFor(fingerprint));
      return null;
    }
    if (!raw.transcript?.chunks?.length) return null;
    return raw;
  } catch {
    return null;
  }
}

export async function saveIngestArtifact(
  artifact: Omit<IngestAnalysisArtifact, "version" | "savedAt"> & {
    version?: number;
    savedAt?: number;
  },
): Promise<void> {
  if (!artifact.fingerprint || !artifact.transcript?.chunks?.length) return;
  try {
    const record: IngestAnalysisArtifact = {
      version: ARTIFACT_VERSION,
      fingerprint: artifact.fingerprint,
      savedAt: Date.now(),
      duration: artifact.duration ?? 0,
      transcript: artifact.transcript,
      suggestions: artifact.suggestions ?? [],
      silenceSegments: artifact.silenceSegments ?? [],
      waveformPeaks: artifact.waveformPeaks ?? null,
      title: artifact.title ?? null,
    };
    await idbSave(keyFor(artifact.fingerprint), record);
  } catch {
    /* IndexedDB unavailable — non-fatal */
  }
}

export async function clearIngestArtifact(fingerprint: string): Promise<void> {
  try {
    await idbDelete(keyFor(fingerprint));
  } catch {
    /* ignore */
  }
}
