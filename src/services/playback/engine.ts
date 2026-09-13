import type { AudioTrack, MediaAsset, Project } from "@/types";
import { mediaPool } from "@/services/media/pool";
import { renderFrame } from "@/services/render/compositor";
import { audioContext, resumeAudio } from "@/services/audio/waveform";
import { clipEnd, isAudioClip, isVideoClip } from "@/features/timeline/selectors";
import { clamp } from "@/utils/format";
import { projectDuration } from "@/features/timeline/selectors";

interface RenderTarget {
  id: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  highQuality: boolean;
  showSubtitles?: boolean;
}

interface ChannelNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
}

const SEEK_TOLERANCE = 0.22;

/**
 * Drives timeline playback: keeps every media element in sync with the
 * playhead, mixes audio through Web Audio and paints registered canvases
 * inside a single requestAnimationFrame loop.
 */
export class PlaybackEngine {
  private project: Project | null = null;
  private assets = new Map<string, MediaAsset>();
  private targets: RenderTarget[] = [];
  private listeners = new Set<(time: number, playing: boolean) => void>();
  private raf = 0;
  private lastFrameTs = 0;
  private channels = new WeakMap<HTMLMediaElement, ChannelNodes>();
  private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private master: GainNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private activeKeys = new Set<string>();

  time = 0;
  playing = false;
  rate = 1;
  volume = 1;
  muted = false;
  loop = false;
  /** number of frames that still have to be repainted while idle */
  private dirtyFrames = 0;

  /** Marks the composition as dirty so the idle loop repaints it. */
  invalidate(frames = 24): void {
    this.dirtyFrames = Math.max(this.dirtyFrames, frames);
  }

  setProject(project: Project, assets: Map<string, MediaAsset>): void {
    this.project = project;
    this.assets = assets;
    this.invalidate();
    if (!this.raf) this.start();
  }

  subscribe(cb: (time: number, playing: boolean) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  addTarget(target: Omit<RenderTarget, "ctx"> & { ctx?: CanvasRenderingContext2D }): void {
    const ctx = target.ctx ?? target.canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    this.targets = [...this.targets.filter((t) => t.id !== target.id), { ...target, ctx } as RenderTarget];
    this.invalidate();
  }

  removeTarget(id: string): void {
    this.targets = this.targets.filter((t) => t.id !== id);
  }

  private masterNode(): GainNode {
    if (!this.master) {
      const ctx = audioContext();
      this.master = ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(ctx.destination);
    }
    return this.master;
  }

  /** Audio destination used by the exporter (MediaRecorder). */
  recordingStream(): MediaStream {
    const ctx = audioContext();
    if (!this.recordDest) {
      this.recordDest = ctx.createMediaStreamDestination();
      this.masterNode().connect(this.recordDest);
    }
    return this.recordDest.stream;
  }

  private channelFor(el: HTMLMediaElement): ChannelNodes {
    let nodes = this.channels.get(el);
    if (!nodes) {
      const ctx = audioContext();
      let src = this.sources.get(el);
      if (!src) {
        src = ctx.createMediaElementSource(el);
        this.sources.set(el, src);
      }
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      const compressor = ctx.createDynamicsCompressor();
      src.connect(highpass).connect(lowpass).connect(gain).connect(compressor).connect(pan).connect(this.masterNode());
      nodes = { gain, pan, highpass, lowpass, compressor };
      this.channels.set(el, nodes);
    }
    return nodes;
  }

  async play(): Promise<void> {
    if (this.playing) return;
    await resumeAudio();
    const dur = this.duration();
    if (dur > 0 && this.time >= dur - 0.01) this.time = 0;
    this.playing = true;
    this.lastFrameTs = performance.now();
    this.invalidate();
    this.emit();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.pauseAll();
    this.invalidate();
    this.emit();
  }

  toggle(): void {
    if (this.playing) this.pause();
    else void this.play();
  }

  seek(time: number): void {
    this.time = Math.max(0, time);
    this.invalidate();
    this.emit();
  }

  setRate(rate: number): void {
    this.rate = rate;
  }

  duration(): number {
    return this.project ? projectDuration(this.project) : 0;
  }

  private emit(): void {
    for (const cb of this.listeners) cb(this.time, this.playing);
  }

  private pauseAll(): void {
    for (const el of mediaPool.allVideoElements()) if (!el.paused) el.pause();
    for (const el of mediaPool.allAudioElements()) if (!el.paused) el.pause();
  }

  start(): void {
    if (this.raf) return;
    this.lastFrameTs = performance.now();
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (ts - this.lastFrameTs) / 1000);
      this.lastFrameTs = ts;
      if (this.playing) {
        this.time += dt * this.rate;
        const dur = this.duration();
        if (dur > 0 && this.time >= dur) {
          if (this.loop) this.time = 0;
          else {
            this.time = dur;
            this.playing = false;
            this.pauseAll();
            this.invalidate();
          }
        }
        this.emit();
      }
      if (this.playing || this.dirtyFrames > 0) {
        if (!this.playing) this.dirtyFrames -= 1;
        this.syncMedia();
        this.paint();
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pauseAll();
  }

  private trackVolume(trackId: string): { volume: number; muted: boolean; pan: number } {
    const project = this.project;
    if (!project) return { volume: 1, muted: false, pan: 0 };
    const track = project.tracks.find((t) => t.id === trackId) as AudioTrack | undefined;
    const soloActive = project.tracks.some((t) => t.kind === "audio" && (t as AudioTrack).solo);
    if (!track || track.kind !== "audio") return { volume: 1, muted: false, pan: 0 };
    const muted = track.muted || (soloActive && !track.solo);
    return { volume: track.volume, muted, pan: track.pan };
  }

  private fadeGain(start: number, duration: number, fadeIn: number, fadeOut: number): number {
    const local = this.time - start;
    let g = 1;
    if (fadeIn > 0 && local < fadeIn) g *= clamp(local / fadeIn, 0, 1);
    const tail = start + duration - this.time;
    if (fadeOut > 0 && tail < fadeOut) g *= clamp(tail / fadeOut, 0, 1);
    return g;
  }

  private syncMedia(): void {
    const project = this.project;
    if (!project) return;
    const time = this.time;
    const nextActive = new Set<string>();

    for (const clip of project.clips) {
      const active = time >= clip.start - 0.05 && time < clipEnd(clip) + 0.05;
      if (!active) continue;
      const trackInfo = this.trackVolume(clip.trackId);
      const trackHidden = project.tracks.find((t) => t.id === clip.trackId)?.hidden ?? false;

      if (isVideoClip(clip)) {
        const asset = this.assets.get(clip.assetId);
        if (!asset || asset.kind !== "video") continue;
        const el = mediaPool.getVideo(clip.id, clip.assetId);
        if (!el) continue;
        nextActive.add(clip.id);
        const local = clamp(time - clip.start, 0, clip.duration);
        const desired = clip.freezeFrame
          ? clip.inPoint
          : clip.reverse
            ? Math.max(0, clip.outPoint - local * clip.speed)
            : clip.inPoint + local * clip.speed;
        const canStream = this.playing && !clip.reverse && !clip.freezeFrame && !trackHidden;
        const effectiveRate = clamp(clip.speed * this.rate, 0.0625, 16);
        if (canStream) {
          if (Math.abs(el.playbackRate - effectiveRate) > 0.01) el.playbackRate = effectiveRate;
          if (el.paused && el.readyState >= 2) el.play().catch(() => undefined);
          if (Math.abs(el.currentTime - desired) > SEEK_TOLERANCE) el.currentTime = desired;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - desired) > 0.02) el.currentTime = desired;
        }
        const hasAudio = asset.hasAudio && !clip.muted && !trackInfo.muted && !this.muted;
        const gain = hasAudio
          ? clip.volume * trackInfo.volume * this.volume * this.fadeGain(clip.start, clip.duration, clip.fadeIn, clip.fadeOut)
          : 0;
        this.applyGain(el, gain, trackInfo.pan, clip.noiseReduction ?? 0, clip.voiceEnhance ?? 0, clip.compressor ?? 0);
      } else if (isAudioClip(clip)) {
        const el = mediaPool.getAudio(clip.id, clip.assetId);
        if (!el) continue;
        nextActive.add(clip.id);
        const local = clamp(time - clip.start, 0, clip.duration);
        const desired = clip.reverse
          ? Math.max(0, clip.outPoint - local * clip.speed)
          : clip.inPoint + local * clip.speed;
        const effectiveRate = clamp(clip.speed * this.rate, 0.0625, 16);
        if (this.playing && !clip.reverse) {
          if (Math.abs(el.playbackRate - effectiveRate) > 0.01) el.playbackRate = effectiveRate;
          if (el.paused && el.readyState >= 2) el.play().catch(() => undefined);
          if (Math.abs(el.currentTime - desired) > SEEK_TOLERANCE) el.currentTime = desired;
        } else {
          if (!el.paused) el.pause();
          if (Math.abs(el.currentTime - desired) > 0.05) el.currentTime = desired;
        }
        const muted = clip.muted || trackInfo.muted || this.muted;
        const gain = muted
          ? 0
          : clip.volume *
            clip.gain *
            trackInfo.volume *
            this.volume *
            this.fadeGain(clip.start, clip.duration, clip.fadeIn, clip.fadeOut);
        this.applyGain(
          el,
          gain,
          clamp(trackInfo.pan + clip.pan, -1, 1),
          clip.noiseReduction ?? 0,
          clip.voiceEnhance ?? 0,
          clip.compressor ?? 0,
        );
      }
    }

    for (const key of this.activeKeys) {
      if (nextActive.has(key)) continue;
      const project = this.project;
      const clip = project?.clips.find((c) => c.id === key);
      if (!clip) continue;
      const el =
        clip.type === "video"
          ? mediaPool.getVideo(clip.id, clip.assetId)
          : clip.type === "audio"
            ? mediaPool.getAudio(clip.id, clip.assetId)
            : null;
      if (el && !el.paused) el.pause();
      if (el) this.applyGain(el, 0, 0);
    }
    this.activeKeys = nextActive;
  }

  private applyGain(
    el: HTMLMediaElement,
    gain: number,
    pan: number,
    noiseReduction = 0,
    voiceEnhance = 0,
    compression = 0,
  ): void {
    try {
      const nodes = this.channelFor(el);
      const ctx = audioContext();
      const target = clamp(gain, 0, 4);
      if (Math.abs(nodes.gain.gain.value - target) > 0.001) {
        nodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
      }
      const p = clamp(pan, -1, 1);
      if (Math.abs(nodes.pan.pan.value - p) > 0.001) nodes.pan.pan.value = p;
      nodes.highpass.frequency.setTargetAtTime(45 + noiseReduction * 155, ctx.currentTime, 0.03);
      nodes.lowpass.frequency.setTargetAtTime(18_000 - noiseReduction * 6_000 + voiceEnhance * 1_000, ctx.currentTime, 0.03);
      nodes.compressor.threshold.value = -24 - compression * 24;
      nodes.compressor.ratio.value = 1 + compression * 9;
      nodes.compressor.attack.value = 0.003;
      nodes.compressor.release.value = 0.18;
      el.muted = false;
      el.volume = 1;
    } catch {
      // Web Audio unavailable for this element — fall back to element volume.
      el.volume = clamp(gain, 0, 1);
    }
  }

  paint(): void {
    const project = this.project;
    if (!project) return;
    for (const target of this.targets) {
      renderFrame({
        ctx: target.ctx,
        width: target.width,
        height: target.height,
        project,
        time: this.time,
        assets: this.assets,
        highQuality: target.highQuality,
        showSubtitles: target.showSubtitles !== false,
      });
    }
  }

  /** Waits until every element needed at `time` is decoded and positioned. */
  async prepareFrame(time: number, timeoutMs = 1200): Promise<void> {
    this.time = time;
    this.syncMedia();
    const project = this.project;
    if (!project) return;
    const waits: Promise<void>[] = [];
    for (const clip of project.clips) {
      if (!isVideoClip(clip)) continue;
      if (time < clip.start || time >= clipEnd(clip)) continue;
      const el = mediaPool.getVideo(clip.id, clip.assetId);
      if (!el) continue;
      if (el.readyState >= 2 && !el.seeking) continue;
      waits.push(
        new Promise<void>((resolve) => {
          const done = () => {
            el.removeEventListener("seeked", done);
            el.removeEventListener("loadeddata", done);
            resolve();
          };
          el.addEventListener("seeked", done);
          el.addEventListener("loadeddata", done);
          window.setTimeout(done, timeoutMs);
        }),
      );
    }
    await Promise.all(waits);
  }
}

export const playbackEngine = new PlaybackEngine();
