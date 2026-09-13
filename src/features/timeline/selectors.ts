import type { AudioClip, Clip, Project, ShapeClip, SubtitleClip, TextClip, Track, VideoClip } from "@/types";

export const clipEnd = (c: Clip): number => c.start + c.duration;

export function projectDuration(project: Project): number {
  let max = 0;
  for (const c of project.clips) max = Math.max(max, clipEnd(c));
  return max;
}

export function clipsOfTrack(project: Project, trackId: string): Clip[] {
  return project.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
}

export function clipAt(project: Project, trackId: string, time: number): Clip | undefined {
  return project.clips.find((c) => c.trackId === trackId && time >= c.start && time < clipEnd(c));
}

export function activeClips(project: Project, time: number): Clip[] {
  return project.clips.filter((c) => time >= c.start - 0.0001 && time < clipEnd(c));
}

export function isVideoClip(c: Clip): c is VideoClip {
  return c.type === "video";
}
export function isAudioClip(c: Clip): c is AudioClip {
  return c.type === "audio";
}
export function isTextClip(c: Clip): c is TextClip {
  return c.type === "text";
}
export function isSubtitleClip(c: Clip): c is SubtitleClip {
  return c.type === "subtitle";
}
export function isShapeClip(c: Clip): c is ShapeClip {
  return c.type === "shape";
}

export function tracksByKind(project: Project, kind: Track["kind"]): Track[] {
  return project.tracks.filter((t) => t.kind === kind);
}

/** Video/text render order: last track in the list paints on top. */
export function renderOrder(project: Project): Track[] {
  return project.tracks.filter((t) => t.kind === "video" && !t.hidden);
}

export function anySolo(project: Project): boolean {
  return project.tracks.some((t) => t.kind === "audio" && t.solo);
}

export interface SnapResult {
  time: number;
  snapped: boolean;
  guide: number | null;
}

/** Magnetic snapping to clip edges, markers, playhead and 0. */
export function snapTime(
  project: Project,
  time: number,
  toleranceSec: number,
  ignoreClipIds: string[],
  playhead: number,
): SnapResult {
  const candidates: number[] = [0, playhead];
  for (const c of project.clips) {
    if (ignoreClipIds.includes(c.id)) continue;
    candidates.push(c.start, clipEnd(c));
  }
  for (const m of project.markers) candidates.push(m.time);
  let best: number | null = null;
  let bestDist = toleranceSec;
  for (const c of candidates) {
    const d = Math.abs(c - time);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best === null
    ? { time, snapped: false, guide: null }
    : { time: best, snapped: true, guide: best };
}

/** Pushes a clip so it no longer overlaps neighbours on the same track. */
export function resolveOverlap(project: Project, moved: Clip): number {
  const others = clipsOfTrack(project, moved.trackId).filter((c) => c.id !== moved.id);
  let start = Math.max(0, moved.start);
  for (const o of others) {
    const end = start + moved.duration;
    if (start < clipEnd(o) && end > o.start) {
      const distLeft = Math.abs(start - (o.start - moved.duration));
      const distRight = Math.abs(start - clipEnd(o));
      start = distLeft < distRight ? Math.max(0, o.start - moved.duration) : clipEnd(o);
    }
  }
  return start;
}

export function findFreeStart(project: Project, trackId: string, desired: number, duration: number): number {
  const others = clipsOfTrack(project, trackId);
  let start = Math.max(0, desired);
  let moved = true;
  let guard = 0;
  while (moved && guard++ < 200) {
    moved = false;
    for (const o of others) {
      if (start < clipEnd(o) && start + duration > o.start) {
        start = clipEnd(o);
        moved = true;
      }
    }
  }
  return start;
}
