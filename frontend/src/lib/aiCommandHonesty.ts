/**
 * Pure helpers for honest AI-command UX and export-range resolution.
 * No React. Used by the editor UI and by node P0 tests.
 */

export type CommandHonestyInput = {
  appliedTypes: string[];
  message?: string | null;
  clamped?: string[];
  dropped?: string[];
  status?: string | null;
};

const FAKE_DONE = /^(done\.?|ok\.?)$/i;

function isFakeDone(raw: string): boolean {
  return !raw || FAKE_DONE.test(raw);
}

/** Never return a fake "Done." when nothing applied or actions were dropped/clamped. */
export function formatCommandFeedback(input: CommandHonestyInput): string {
  const applied = input.appliedTypes.filter(Boolean);
  const clamped = input.clamped ?? [];
  const dropped = input.dropped ?? [];
  const raw = (input.message ?? "").trim();
  const notes = [
    clamped.length ? `Clamped: ${clamped.join("; ")}` : "",
    dropped.length ? `Dropped: ${dropped.join("; ")}` : "",
  ].filter(Boolean);
  const noOp =
    applied.length === 0 ||
    input.status === "no_op" ||
    input.status === "noop";

  if (noOp) {
    if (notes.length) return `No edits applied. ${notes.join(" ")}`;
    if (!isFakeDone(raw)) return raw;
    return "No edits applied — the model returned no valid timeline actions. Rephrase the command.";
  }

  const base = isFakeDone(raw) ? `Applied ${applied.join(", ")}.` : raw;
  return notes.length ? `${base} ${notes.join(" ")}` : base;
}

export type TrimMarkerLike = { startTime: number; endTime: number } | null;
export type ClipLike = { start: number; end: number } | null;

export type ExportRangeInput = {
  markIn: number | null;
  markOut: number | null;
  trimMarker: TrimMarkerLike;
  selectedClip: ClipLike;
  duration: number;
};

export type ExportRange = {
  start: number;
  end: number;
  source: "marks" | "trim" | "clip" | "full";
};

/** Preview/export range: marks, else TRIM marker, else selected clip, else full duration. */
export function resolveExportRange(input: ExportRangeInput): ExportRange {
  const duration = Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0;
  const { markIn, markOut, trimMarker, selectedClip } = input;

  if (
    markIn !== null &&
    markOut !== null &&
    Number.isFinite(markIn) &&
    Number.isFinite(markOut) &&
    markOut > markIn
  ) {
    return { start: Math.min(markIn, markOut), end: Math.max(markIn, markOut), source: "marks" };
  }

  if (
    trimMarker &&
    Number.isFinite(trimMarker.startTime) &&
    Number.isFinite(trimMarker.endTime) &&
    trimMarker.endTime > trimMarker.startTime
  ) {
    return { start: trimMarker.startTime, end: trimMarker.endTime, source: "trim" };
  }

  if (
    selectedClip &&
    Number.isFinite(selectedClip.start) &&
    Number.isFinite(selectedClip.end) &&
    selectedClip.end > selectedClip.start
  ) {
    return { start: selectedClip.start, end: selectedClip.end, source: "clip" };
  }

  return { start: 0, end: duration, source: "full" };
}

export function shouldSkipCreditGate(mockAiMode: boolean): boolean {
  return mockAiMode === true;
}

/** Loaded local/URL media must survive optional transcript / analysis failure. */
export function shouldPreserveEditorSession(hasLoadedMedia: boolean): boolean {
  return hasLoadedMedia === true;
}
