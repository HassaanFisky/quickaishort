"use client";

import type { MotionPath, PropertyTrack, Keyframe, AnimatableProperty, Easing } from "./keyframeTypes";

/** In-memory store for motion paths, keyed by clipId. */
const _store = new Map<string, MotionPath>();

export function getMotionPath(clipId: string): MotionPath | null {
  return _store.get(clipId) ?? null;
}

export function setMotionPath(path: MotionPath): void {
  _store.set(path.clipId, path);
}

export function deleteMotionPath(clipId: string): void {
  _store.delete(clipId);
}

export function getTrack(clipId: string, property: AnimatableProperty): PropertyTrack | null {
  return _store.get(clipId)?.tracks.find((t) => t.property === property) ?? null;
}

export function upsertKeyframe(
  clipId: string,
  property: AnimatableProperty,
  kf: Keyframe
): void {
  let path = _store.get(clipId);
  if (!path) {
    path = { clipId, tracks: [] };
    _store.set(clipId, path);
  }
  let track = path.tracks.find((t) => t.property === property);
  if (!track) {
    track = { property, keyframes: [] };
    path.tracks.push(track);
  }
  const idx = track.keyframes.findIndex((k) => k.id === kf.id);
  if (idx >= 0) {
    track.keyframes[idx] = kf;
  } else {
    track.keyframes.push(kf);
  }
  // Keep sorted by timeMs
  track.keyframes.sort((a, b) => a.timeMs - b.timeMs);
}

export function deleteKeyframe(clipId: string, property: AnimatableProperty, kfId: string): void {
  const track = getTrack(clipId, property);
  if (!track) return;
  track.keyframes = track.keyframes.filter((k) => k.id !== kfId);
}

export function clearAllKeyframes(clipId: string): void {
  _store.delete(clipId);
}

/** Serialize all motion paths to JSON (for qep project file). */
export function serializeMotionPaths(): Record<string, MotionPath> {
  const out: Record<string, MotionPath> = {};
  for (const [id, path] of _store) out[id] = path;
  return out;
}

/** Restore from serialized data. */
export function deserializeMotionPaths(data: Record<string, MotionPath>): void {
  _store.clear();
  for (const [id, path] of Object.entries(data)) _store.set(id, path);
}

export function setKeyframeEasing(
  clipId: string,
  property: AnimatableProperty,
  kfId: string,
  easing: Easing
): void {
  const track = getTrack(clipId, property);
  if (!track) return;
  const kf = track.keyframes.find((k) => k.id === kfId);
  if (kf) kf.easing = easing;
}
