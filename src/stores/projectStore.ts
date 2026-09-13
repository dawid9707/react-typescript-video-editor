import { create } from "zustand";
import type {
  AudioClip,
  AudioTrack,
  Clip,
  Effect,
  MediaAsset,
  Marker,
  Project,
  ProjectSettings,
  ShapeType,
  SubtitleCue,
  Track,
  TrackKind,
  Transition,
  VideoClip,
} from "@/types";
import {
  createAudioClip,
  createBlurClip,
  createEmptyProject,
  createImageClip,
  createSubtitleClip,
  createTextClip,
  createShapeClip,
  createVideoClip,
} from "@/features/project/factory";
import { clipEnd, findFreeStart } from "@/features/timeline/selectors";
import { uid } from "@/utils/format";

const HISTORY_LIMIT = 80;

interface HistoryMeta {
  key?: string;
}

let lastHistoryKey: string | null = null;
let lastHistoryAt = 0;

interface ProjectState {
  project: Project;
  past: Project[];
  future: Project[];
  dirty: boolean;
  lastSavedAt: number | null;
  clipboard: Clip[];

  apply: (updater: (p: Project) => Project, history?: boolean, meta?: HistoryMeta) => void;
  undo: () => void;
  redo: () => void;
  markSaved: () => void;

  newProject: (name?: string) => void;
  loadProject: (project: Project) => void;
  openProjectJson: (json: string) => void;
  renameProject: (name: string) => void;
  updateSettings: (patch: Partial<ProjectSettings>) => void;

  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (assetId: string) => void;

  addTrack: (kind: TrackKind) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, patch: Partial<AudioTrack> & Partial<Track>) => void;
  moveTrack: (trackId: string, dir: -1 | 1) => void;
  reorderTrack: (trackId: string, targetTrackId: string) => void;

  addAssetToTimeline: (assetId: string, trackId?: string, start?: number) => string | null;
  addTextClip: (trackId: string | undefined, start: number, text?: string) => string | null;
  addShapeClip: (trackId: string | undefined, start: number, shape: ShapeType) => string | null;
  addBlurClip: (trackId: string | undefined, start: number) => string | null;
  addSubtitleCues: (cues: SubtitleCue[], assetId?: string, trackId?: string) => void;

  updateClip: (clipId: string, patch: Partial<Clip>, meta?: HistoryMeta) => void;
  moveClip: (clipId: string, start: number, trackId?: string) => void;
  trimClip: (clipId: string, edge: "start" | "end", timelineTime: number) => void;
  splitClips: (clipIds: string[], time: number) => string[];
  deleteClips: (clipIds: string[]) => void;
  duplicateClips: (clipIds: string[]) => string[];
  copyClips: (clipIds: string[]) => void;
  pasteClips: (time: number) => string[];
  detachAudio: (clipId: string) => void;
  replaceClipAsset: (clipId: string, assetId: string) => void;
  setClipSpeed: (clipId: string, speed: number, meta?: HistoryMeta) => void;

  addEffect: (clipId: string, effect: Effect) => void;
  updateEffect: (clipId: string, effectId: string, patch: Partial<Effect>, meta?: HistoryMeta) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  reorderEffect: (clipId: string, effectId: string, dir: -1 | 1) => void;
  setTransition: (clipId: string, side: "in" | "out", transition: Transition | undefined) => void;

  addMarker: (time: number) => string;
  updateMarker: (id: string, patch: Partial<Marker>) => void;
  removeMarker: (id: string) => void;
}

const withClips = (p: Project, clips: Clip[]): Project => ({ ...p, clips });

function mergeClip(clip: Clip, patch: Partial<Clip>): Clip {
  return { ...clip, ...patch } as Clip;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: createEmptyProject(),
  past: [],
  future: [],
  dirty: false,
  lastSavedAt: null,
  clipboard: [],

  apply: (updater, history = true, meta) => {
    set((state) => {
      const next = updater(state.project);
      if (next === state.project) return {};
      let past = state.past;
      if (history) {
        const now = Date.now();
        const coalesce = meta?.key && meta.key === lastHistoryKey && now - lastHistoryAt < 900;
        if (!coalesce) past = [...state.past, state.project].slice(-HISTORY_LIMIT);
        lastHistoryKey = meta?.key ?? null;
        lastHistoryAt = now;
      }
      return {
        project: { ...next, updatedAt: Date.now() },
        past,
        future: history ? [] : state.future,
        dirty: true,
      };
    });
  },

  undo: () =>
    set((state) => {
      if (!state.past.length) return {};
      const previous = state.past[state.past.length - 1];
      lastHistoryKey = null;
      return {
        project: previous,
        past: state.past.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (!state.future.length) return {};
      const next = state.future[0];
      lastHistoryKey = null;
      return {
        project: next,
        past: [...state.past, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: true,
      };
    }),

  markSaved: () => set({ dirty: false, lastSavedAt: Date.now() }),

  newProject: (name) =>
    set({ project: createEmptyProject(name), past: [], future: [], dirty: false, lastSavedAt: null }),

  loadProject: (project) => set({ project, past: [], future: [], dirty: false, lastSavedAt: Date.now() }),

  openProjectJson: (json) => {
    try {
      const parsed = JSON.parse(json) as Project;
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.clips) || !Array.isArray(parsed.tracks)) {
        throw new Error("Nieprawidłowy format projektu.");
      }
      get().loadProject(parsed);
    } catch {
      throw new Error("Nie udało się wczytać projektu z pliku JSON.");
    }
  },

  renameProject: (name) => get().apply((p) => ({ ...p, name }), true, { key: "rename" }),

  updateSettings: (patch) =>
    get().apply((p) => ({ ...p, settings: { ...p.settings, ...patch } }), true, { key: "settings" }),

  addAssets: (assets) => get().apply((p) => ({ ...p, assets: [...p.assets, ...assets] })),

  removeAsset: (assetId) =>
    get().apply((p) => ({
      ...p,
      assets: p.assets.filter((a) => a.id !== assetId),
      clips: p.clips.filter((c) => !("assetId" in c && c.assetId === assetId)),
    })),

  addTrack: (kind) => {
    const id = uid("trk");
    get().apply((p) => {
      const count = p.tracks.filter((t) => t.kind === kind).length + 1;
      const prefix = kind === "video" ? "V" : kind === "audio" ? "A" : "S";
      const base = { id, kind, name: `${prefix}${count}`, height: kind === "subtitle" ? 46 : 66, locked: false, hidden: false };
      const track: Track =
        kind === "audio"
          ? { ...base, kind: "audio", volume: 1, pan: 0, muted: false, solo: false }
          : kind === "video"
            ? { ...base, kind: "video", opacity: 1 }
            : { ...base, kind: "subtitle" };
      const tracks =
        kind === "video"
          ? [track, ...p.tracks]
          : kind === "audio"
            ? [
                ...p.tracks.filter((t) => t.kind !== "subtitle"),
                track,
                ...p.tracks.filter((t) => t.kind === "subtitle"),
              ]
            : [...p.tracks, track];
      return { ...p, tracks };
    });
    return id;
  },

  removeTrack: (trackId) =>
    get().apply((p) => ({
      ...p,
      tracks: p.tracks.filter((t) => t.id !== trackId),
      clips: p.clips.filter((c) => c.trackId !== trackId),
    })),

  updateTrack: (trackId, patch) =>
    get().apply(
      (p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? ({ ...t, ...patch } as Track) : t)),
      }),
      true,
      { key: `track:${trackId}` },
    ),

  moveTrack: (trackId, dir) =>
    get().apply((p) => {
      const idx = p.tracks.findIndex((t) => t.id === trackId);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= p.tracks.length) return p;
      const tracks = [...p.tracks];
      [tracks[idx], tracks[target]] = [tracks[target], tracks[idx]];
      return { ...p, tracks };
    }),

  reorderTrack: (trackId, targetTrackId) =>
    get().apply((p) => {
      if (trackId === targetTrackId) return p;
      const from = p.tracks.findIndex((t) => t.id === trackId);
      const target = p.tracks.findIndex((t) => t.id === targetTrackId);
      if (from < 0 || target < 0) return p;
      const tracks = [...p.tracks];
      const [moved] = tracks.splice(from, 1);
      tracks.splice(target, 0, moved);
      return { ...p, tracks };
    }, true, { key: `reorder-track:${trackId}` }),

  addAssetToTimeline: (assetId, trackId, start) => {
    const project = get().project;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return null;
    let newId: string | null = null;
    get().apply((p) => {
      const wantKind: TrackKind = asset.kind === "audio" ? "audio" : asset.kind === "subtitle" ? "subtitle" : "video";
      let track = trackId ? p.tracks.find((t) => t.id === trackId) : undefined;
      if (!track || track.kind !== wantKind) track = p.tracks.find((t) => t.kind === wantKind);
      if (!track) return p;
      const desired = start ?? 0;
      if (asset.kind === "subtitle") {
        const clips = asset.cues.map((cue) =>
          createSubtitleClip(track!.id, desired + cue.start, desired + cue.end, cue.text, asset.id),
        );
        newId = clips[0]?.id ?? null;
        return withClips(p, [...p.clips, ...clips]);
      }
      const duration =
        asset.kind === "video" ? Math.max(0.1, asset.duration || 5) : asset.kind === "audio" ? Math.max(0.1, asset.duration || 5) : 5;
      const from = findFreeStart(p, track.id, desired, duration);
      const clip: Clip =
        asset.kind === "video"
          ? createVideoClip(asset, track.id, from)
          : asset.kind === "audio"
            ? createAudioClip(asset, track.id, from)
            : createImageClip(asset.id, asset.name, track.id, from);
      newId = clip.id;
      return withClips(p, [...p.clips, clip]);
    });
    return newId;
  },

  addTextClip: (trackId, start, text) => {
    let id: string | null = null;
    get().apply((p) => {
      const track = p.tracks.find((t) => t.id === trackId && t.kind === "video") ?? p.tracks.find((t) => t.kind === "video");
      if (!track) return p;
      const clip = createTextClip(track.id, findFreeStart(p, track.id, start, 4), text);
      id = clip.id;
      return withClips(p, [...p.clips, clip]);
    });
    return id;
  },

  addShapeClip: (trackId, start, shape) => {
    let id: string | null = null;
    get().apply((p) => {
      const track = p.tracks.find((t) => t.id === trackId && t.kind === "video") ?? p.tracks.find((t) => t.kind === "video");
      if (!track) return p;
      const clip = createShapeClip(track.id, Math.max(0, start), shape);
      id = clip.id;
      return withClips(p, [...p.clips, clip]);
    });
    return id;
  },

  addBlurClip: (trackId, start) => {
    let id: string | null = null;
    get().apply((p) => {
      const track = p.tracks.find((t) => t.id === trackId && t.kind === "video") ?? p.tracks.find((t) => t.kind === "video");
      if (!track) return p;
      const clip = createBlurClip(track.id, start);
      id = clip.id;
      return withClips(p, [...p.clips, clip]);
    });
    return id;
  },

  addSubtitleCues: (cues, assetId, trackId) =>
    get().apply((p) => {
      const track = p.tracks.find((t) => t.id === trackId && t.kind === "subtitle") ?? p.tracks.find((t) => t.kind === "subtitle");
      if (!track) return p;
      const clips = cues.map((cue) => createSubtitleClip(track.id, cue.start, cue.end, cue.text, assetId));
      return withClips(p, [...p.clips, ...clips]);
    }),

  updateClip: (clipId, patch, meta) =>
    get().apply(
      (p) => withClips(p, p.clips.map((c) => (c.id === clipId ? mergeClip(c, patch) : c))),
      true,
      meta ?? { key: `clip:${clipId}` },
    ),

  moveClip: (clipId, start, trackId) =>
    get().apply(
      (p) =>
        withClips(
          p,
          p.clips.map((c) =>
            c.id === clipId ? ({ ...c, start: Math.max(0, start), trackId: trackId ?? c.trackId } as Clip) : c,
          ),
        ),
      true,
      { key: `move:${clipId}` },
    ),

  trimClip: (clipId, edge, timelineTime) =>
    get().apply(
      (p) =>
        withClips(
          p,
          p.clips.map((c) => {
            if (c.id !== clipId) return c;
            if (edge === "start") {
              const maxStart = clipEnd(c) - 0.1;
              const newStart = Math.max(0, Math.min(timelineTime, maxStart));
              const delta = newStart - c.start;
              const next = { ...c, start: newStart, duration: c.duration - delta } as Clip;
              if ("inPoint" in next && "speed" in next) {
                const media = next as VideoClip | AudioClip;
                media.inPoint = Math.max(0, media.inPoint + delta * media.speed);
              }
              return next;
            }
            const newEnd = Math.max(c.start + 0.1, timelineTime);
            const next = { ...c, duration: newEnd - c.start } as Clip;
            if ("outPoint" in next && "speed" in next) {
              const media = next as VideoClip | AudioClip;
              media.outPoint = media.inPoint + next.duration * media.speed;
            }
            return next;
          }),
        ),
      true,
      { key: `trim:${clipId}:${edge}` },
    ),

  splitClips: (clipIds, time) => {
    const created: string[] = [];
    get().apply((p) => {
      const next: Clip[] = [];
      for (const c of p.clips) {
        const inRange = clipIds.includes(c.id) && time > c.start + 0.05 && time < clipEnd(c) - 0.05;
        if (!inRange) {
          next.push(c);
          continue;
        }
        const leftDuration = time - c.start;
        const left = { ...c, duration: leftDuration } as Clip;
        const right = { ...c, id: uid("clip"), start: time, duration: c.duration - leftDuration } as Clip;
        if ("inPoint" in left && "speed" in left) {
          const l = left as VideoClip | AudioClip;
          const r = right as VideoClip | AudioClip;
          const srcSplit = l.inPoint + leftDuration * l.speed;
          l.outPoint = srcSplit;
          r.inPoint = srcSplit;
        }
        created.push(right.id);
        next.push(left, right);
      }
      return withClips(p, next);
    });
    return created;
  },

  deleteClips: (clipIds) => get().apply((p) => withClips(p, p.clips.filter((c) => !clipIds.includes(c.id)))),

  duplicateClips: (clipIds) => {
    const created: string[] = [];
    get().apply((p) => {
      const copies: Clip[] = [];
      for (const c of p.clips) {
        if (!clipIds.includes(c.id)) continue;
        const copy = { ...c, id: uid("clip"), start: findFreeStart(p, c.trackId, clipEnd(c), c.duration) } as Clip;
        created.push(copy.id);
        copies.push(copy);
      }
      return withClips(p, [...p.clips, ...copies]);
    });
    return created;
  },

  copyClips: (clipIds) => {
    const clips = get().project.clips.filter((c) => clipIds.includes(c.id));
    set({ clipboard: clips.map((c) => ({ ...c })) });
  },

  pasteClips: (time) => {
    const clipboard = get().clipboard;
    if (!clipboard.length) return [];
    const created: string[] = [];
    const base = Math.min(...clipboard.map((c) => c.start));
    get().apply((p) => {
      const pasted: Clip[] = [];
      for (const c of clipboard) {
        const trackExists = p.tracks.some((t) => t.id === c.trackId);
        const trackId = trackExists
          ? c.trackId
          : (p.tracks.find((t) => t.kind === (c.type === "audio" ? "audio" : c.type === "subtitle" ? "subtitle" : "video"))?.id ?? c.trackId);
        const copy = {
          ...c,
          id: uid("clip"),
          trackId,
          start: findFreeStart(p, trackId, time + (c.start - base), c.duration),
        } as Clip;
        created.push(copy.id);
        pasted.push(copy);
      }
      return withClips(p, [...p.clips, ...pasted]);
    });
    return created;
  },

  detachAudio: (clipId) =>
    get().apply((p) => {
      const clip = p.clips.find((c) => c.id === clipId);
      if (!clip || clip.type !== "video") return p;
      const asset = p.assets.find((a) => a.id === clip.assetId);
      if (!asset || asset.kind !== "video" || !asset.hasAudio) return p;
      const audioTrack = p.tracks.find((t) => t.kind === "audio");
      if (!audioTrack) return p;
      const audio: AudioClip = {
        id: uid("clip"),
        type: "audio",
        trackId: audioTrack.id,
        start: findFreeStart(p, audioTrack.id, clip.start, clip.duration),
        duration: clip.duration,
        label: `${clip.label} (audio)`,
        assetId: clip.assetId,
        inPoint: clip.inPoint,
        outPoint: clip.outPoint,
        speed: clip.speed,
        volume: clip.volume,
        gain: 1,
        pan: 0,
        muted: false,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        reverse: clip.reverse,
        noiseReduction: clip.noiseReduction ?? 0,
        voiceEnhance: clip.voiceEnhance ?? 0,
        compressor: clip.compressor ?? 0,
      };
      return withClips(p, [
        ...p.clips.map((c) => (c.id === clipId ? ({ ...c, muted: true } as Clip) : c)),
        audio,
      ]);
    }),

  replaceClipAsset: (clipId, assetId) =>
    get().apply((p) => {
      const asset = p.assets.find((a) => a.id === assetId);
      if (!asset) return p;
      return withClips(
        p,
        p.clips.map((c) => {
          if (c.id !== clipId || !("assetId" in c)) return c;
          const dur = "duration" in asset ? (asset as { duration: number }).duration : c.duration;
          return { ...c, assetId, label: asset.name, inPoint: 0, outPoint: Math.min(dur, c.duration) } as Clip;
        }),
      );
    }),

  setClipSpeed: (clipId, speed, meta) =>
    get().apply(
      (p) =>
        withClips(
          p,
          p.clips.map((c) => {
            if (c.id !== clipId || (c.type !== "video" && c.type !== "audio")) return c;
            const media = c as VideoClip | AudioClip;
            const srcSpan = media.outPoint - media.inPoint;
            const newSpeed = Math.max(0.1, Math.min(8, speed));
            return { ...media, speed: newSpeed, duration: Math.max(0.1, srcSpan / newSpeed) } as Clip;
          }),
        ),
      true,
      meta ?? { key: `speed:${clipId}` },
    ),

  addEffect: (clipId, effect) =>
    get().apply((p) =>
      withClips(
        p,
        p.clips.map((c) =>
          c.id === clipId && (c.type === "video" || c.type === "text")
            ? ({ ...c, effects: [...c.effects, effect] } as Clip)
            : c,
        ),
      ),
    ),

  updateEffect: (clipId, effectId, patch, meta) =>
    get().apply(
      (p) =>
        withClips(
          p,
          p.clips.map((c) =>
            c.id === clipId && (c.type === "video" || c.type === "text")
              ? ({
                  ...c,
                  effects: c.effects.map((e) => (e.id === effectId ? { ...e, ...patch, params: { ...e.params, ...(patch.params ?? {}) } } : e)),
                } as Clip)
              : c,
          ),
        ),
      true,
      meta ?? { key: `fx:${effectId}` },
    ),

  removeEffect: (clipId, effectId) =>
    get().apply((p) =>
      withClips(
        p,
        p.clips.map((c) =>
          c.id === clipId && (c.type === "video" || c.type === "text")
            ? ({ ...c, effects: c.effects.filter((e) => e.id !== effectId) } as Clip)
            : c,
        ),
      ),
    ),

  reorderEffect: (clipId, effectId, dir) =>
    get().apply((p) =>
      withClips(
        p,
        p.clips.map((c) => {
          if (c.id !== clipId || (c.type !== "video" && c.type !== "text")) return c;
          const effects = [...c.effects];
          const idx = effects.findIndex((e) => e.id === effectId);
          const target = idx + dir;
          if (idx < 0 || target < 0 || target >= effects.length) return c;
          [effects[idx], effects[target]] = [effects[target], effects[idx]];
          return { ...c, effects } as Clip;
        }),
      ),
    ),

  setTransition: (clipId, side, transition) =>
    get().apply((p) =>
      withClips(
        p,
        p.clips.map((c) =>
          c.id === clipId ? ({ ...c, [side === "in" ? "transitionIn" : "transitionOut"]: transition } as Clip) : c,
        ),
      ),
    ),

  addMarker: (time) => {
    const id = uid("mk");
    get().apply((p) => ({
      ...p,
      markers: [
        ...p.markers,
        { id, time, name: `Marker ${p.markers.length + 1}`, color: "#f2b134", note: "" },
      ],
    }));
    return id;
  },

  updateMarker: (id, patch) =>
    get().apply(
      (p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }),
      true,
      { key: `marker:${id}` },
    ),

  removeMarker: (id) => get().apply((p) => ({ ...p, markers: p.markers.filter((m) => m.id !== id) })),
}));

export const useAssetMap = (): Map<string, MediaAsset> => {
  const assets = useProjectStore((s) => s.project.assets);
  return new Map(assets.map((a) => [a.id, a]));
};
