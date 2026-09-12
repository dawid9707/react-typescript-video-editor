let ctx: AudioContext | null = null;

/** Shared AudioContext for the whole app (created lazily, resumed on gesture). */
export function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor({ latencyHint: "interactive" });
  }
  return ctx;
}

export async function resumeAudio(): Promise<void> {
  const c = audioContext();
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* ignored — browser will retry on next gesture */
    }
  }
}

const decodeCache = new Map<string, AudioBuffer>();

/** Real decode through Web Audio. Returns null when the file has no audio. */
export async function decodeAudio(file: File): Promise<AudioBuffer | null> {
  const key = `${file.name}:${file.size}:${file.lastModified}`;
  const cached = decodeCache.get(key);
  if (cached) return cached;
  const data = await file.arrayBuffer();
  const c = audioContext();
  const buffer = await c.decodeAudioData(data.slice(0));
  if (decodeCache.size > 12) decodeCache.delete(decodeCache.keys().next().value as string);
  decodeCache.set(key, buffer);
  return buffer;
}

export function getDecoded(file: File): AudioBuffer | undefined {
  return decodeCache.get(`${file.name}:${file.size}:${file.lastModified}`);
}

/**
 * Downsamples an AudioBuffer to `buckets` absolute peaks (0..1).
 * Mixes all channels; used by the timeline waveform renderer.
 */
export function computePeaks(buffer: AudioBuffer, buckets = 2000): number[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const total = buffer.length;
  const step = Math.max(1, Math.floor(total / buckets));
  const peaks = new Array<number>(buckets).fill(0);
  for (let i = 0; i < buckets; i++) {
    const startIdx = i * step;
    const endIdx = Math.min(total, startIdx + step);
    let peak = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      const data = channels[ch];
      const hop = Math.max(1, Math.floor((endIdx - startIdx) / 256));
      for (let j = startIdx; j < endIdx; j += hop) {
        const v = Math.abs(data[j]);
        if (v > peak) peak = v;
      }
    }
    peaks[i] = Math.min(1, peak);
  }
  return peaks;
}

/* ------------------------------------------------------------------
 * Off-main-thread peak analysis.
 * The worker is created from an inline blob so it survives any bundling
 * strategy (including single-file builds) without an extra network file.
 * ------------------------------------------------------------------ */

const PEAKS_WORKER_SOURCE = `
self.onmessage = (event) => {
  const { channels, buckets, id } = event.data;
  const length = channels[0] ? channels[0].length : 0;
  const step = Math.max(1, Math.floor(length / buckets));
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    const start = i * step;
    const end = Math.min(length, start + step);
    const hop = Math.max(1, Math.floor((end - start) / 256));
    let peak = 0;
    for (let c = 0; c < channels.length; c++) {
      const data = channels[c];
      for (let j = start; j < end; j += hop) {
        const v = data[j] < 0 ? -data[j] : data[j];
        if (v > peak) peak = v;
      }
    }
    peaks[i] = peak > 1 ? 1 : peak;
  }
  self.postMessage({ id, peaks }, [peaks.buffer]);
};
`;

let peaksWorker: Worker | null = null;
let workerSeq = 0;

function getPeaksWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (!peaksWorker) {
    try {
      const url = URL.createObjectURL(new Blob([PEAKS_WORKER_SOURCE], { type: "text/javascript" }));
      peaksWorker = new Worker(url);
    } catch {
      return null;
    }
  }
  return peaksWorker;
}

/** Computes peaks in a Web Worker; falls back to the synchronous path. */
export function computePeaksAsync(buffer: AudioBuffer, buckets = 2000): Promise<number[]> {
  const worker = getPeaksWorker();
  if (!worker) return Promise.resolve(computePeaks(buffer, buckets));
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) {
    channels.push(new Float32Array(buffer.getChannelData(c)));
  }
  const id = ++workerSeq;
  return new Promise<number[]>((resolve) => {
    const onMessage = (e: MessageEvent<{ id: number; peaks: Float32Array }>) => {
      if (e.data.id !== id) return;
      worker.removeEventListener("message", onMessage);
      resolve(Array.from(e.data.peaks));
    };
    worker.addEventListener("message", onMessage);
    window.setTimeout(() => {
      worker.removeEventListener("message", onMessage);
      resolve(computePeaks(buffer, buckets));
    }, 20000);
    worker.postMessage(
      { id, buckets, channels },
      channels.map((c) => c.buffer),
    );
  });
}

/** Samples a peak slice for a given source-time window. */
export function slicePeaks(
  peaks: number[],
  duration: number,
  from: number,
  to: number,
  count: number,
): number[] {
  if (!peaks.length || duration <= 0 || count <= 0) return [];
  const out = new Array<number>(count).fill(0);
  const perSecond = peaks.length / duration;
  for (let i = 0; i < count; i++) {
    const t0 = from + ((to - from) * i) / count;
    const t1 = from + ((to - from) * (i + 1)) / count;
    const a = Math.max(0, Math.floor(t0 * perSecond));
    const b = Math.min(peaks.length, Math.max(a + 1, Math.ceil(t1 * perSecond)));
    let peak = 0;
    for (let j = a; j < b; j++) if (peaks[j] > peak) peak = peaks[j];
    out[i] = peak;
  }
  return out;
}
