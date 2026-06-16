export interface TimelineClip {
  id: string;
  trackId: string;
  sourceId: string; // reference to source media (YouTube URL or file name)
  inPoint: number; // source in-point (seconds)
  outPoint: number; // source out-point (seconds)
  timelineStart: number; // position on timeline (seconds)
  speed: number; // playback rate (1.0 = normal)
  label?: string;
  colorLabel?: string;
}

export interface Track {
  id: string;
  type: "video" | "audio";
  label: string; // "V1", "V2", "A1", etc.
  clips: TimelineClip[]; // sorted by timelineStart
  locked: boolean;
  muted: boolean;
  solo: boolean;
  height: number; // track height in pixels (default 32)
}

export interface TimelineState {
  tracks: Track[];
  playheadTime: number;
  fps: number;
}

export function getClipDuration(clip: TimelineClip): number {
  return (clip.outPoint - clip.inPoint) / clip.speed;
}

export function getClipEnd(clip: TimelineClip): number {
  return clip.timelineStart + getClipDuration(clip);
}

export function getAllClips(tracks: Track[]): TimelineClip[] {
  return tracks.flatMap((t) => t.clips).sort((a, b) => a.timelineStart - b.timelineStart);
}

export function getTrackById(tracks: Track[], id: string): Track | undefined {
  return tracks.find((t) => t.id === id);
}

export function createDefaultTracks(): Track[] {
  return [
    { id: "v1", type: "video", label: "V1", clips: [], locked: false, muted: false, solo: false, height: 32 },
    { id: "a1", type: "audio", label: "A1", clips: [], locked: false, muted: false, solo: false, height: 24 },
  ];
}
