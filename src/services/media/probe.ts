import type { AudioAsset, ImageAsset, MediaAsset, MediaKind, VideoAsset } from "@/types";
import { uid } from "@/utils/format";
import { computePeaksAsync, decodeAudio } from "@/services/audio/waveform";

export const VIDEO_EXT = ["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv", "m2ts", "ts", "3gp"];
export const AUDIO_EXT = ["mp3", "wav", "aac", "m4a", "ogg", "oga", "opus", "flac", "weba"];
export const IMAGE_EXT = ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"];
export const SUB_EXT = ["srt", "vtt"];

export const ACCEPT_ATTRIBUTE = [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT, ...SUB_EXT]
  .map((e) => `.${e}`)
  .join(",");

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function kindOf(file: File): MediaKind | null {
  const ext = extOf(file.name);
  if (SUB_EXT.includes(ext)) return "subtitle";
  if (VIDEO_EXT.includes(ext) || file.type.startsWith("video/")) return "video";
  if (AUDIO_EXT.includes(ext) || file.type.startsWith("audio/")) return "audio";
  if (IMAGE_EXT.includes(ext) || file.type.startsWith("image/")) return "image";
  return null;
}

/* ------------------------------------------------------------------
 * Container sniffing — reads the head of the file and looks for real
 * codec signatures (ISO-BMFF sample entries / Matroska CodecID).
 * ------------------------------------------------------------------ */

interface SniffResult {
  video: string | null;
  audio: string | null;
  container: string;
}

const VIDEO_SIGNATURES: [string, string][] = [
  ["avc1", "H.264 / AVC"],
  ["avc3", "H.264 / AVC"],
  ["hvc1", "H.265 / HEVC"],
  ["hev1", "H.265 / HEVC"],
  ["av01", "AV1"],
  ["vp09", "VP9"],
  ["vp08", "VP8"],
  ["mp4v", "MPEG-4 Visual"],
  ["V_MPEG4/ISO/AVC", "H.264 / AVC"],
  ["V_MPEGH/ISO/HEVC", "H.265 / HEVC"],
  ["V_VP9", "VP9"],
  ["V_VP8", "VP8"],
  ["V_AV1", "AV1"],
];

const AUDIO_SIGNATURES: [string, string][] = [
  ["mp4a", "AAC"],
  ["Opus", "Opus"],
  ["ec-3", "E-AC-3"],
  ["ac-3", "AC-3"],
  ["alac", "ALAC"],
  ["A_AAC", "AAC"],
  ["A_OPUS", "Opus"],
  ["A_VORBIS", "Vorbis"],
  ["A_FLAC", "FLAC"],
  ["A_MPEG/L3", "MP3"],
  ["A_PCM", "PCM"],
];

async function sniffCodecs(file: File): Promise<SniffResult> {
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, 2_000_000)).arrayBuffer());
  let ascii = "";
  const chunk = 32768;
  for (let i = 0; i < head.length; i += chunk) {
    ascii += String.fromCharCode(...head.subarray(i, Math.min(i + chunk, head.length)));
  }
  let container = extOf(file.name).toUpperCase() || file.type || "—";
  if (ascii.includes("ftyp")) container = ascii.slice(ascii.indexOf("ftyp") + 4, ascii.indexOf("ftyp") + 8).trim();
  else if (head[0] === 0x1a && head[1] === 0x45) container = ascii.includes("webm") ? "WebM" : "Matroska";
  else if (ascii.startsWith("RIFF")) container = "RIFF/AVI";

  let video: string | null = null;
  let audio: string | null = null;
  for (const [sig, label] of VIDEO_SIGNATURES) if (!video && ascii.includes(sig)) video = label;
  for (const [sig, label] of AUDIO_SIGNATURES) if (!audio && ascii.includes(sig)) audio = label;
  const ext = extOf(file.name);
  if (!audio && ext === "mp3") audio = "MP3";
  if (!audio && ext === "wav") audio = "PCM";
  if (!audio && ext === "flac") audio = "FLAC";
  if (!audio && ext === "ogg") audio = "Vorbis";
  return { video, audio, container };
}

/* ------------------------------------------------------------------
 * HTMLVideoElement based metadata + poster frame + fps estimation
 * ------------------------------------------------------------------ */

interface VideoProbe {
  duration: number;
  width: number;
  height: number;
  fps: number;
  thumbnail?: string;
  playable: boolean;
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = "anonymous";
    const done = () => resolve(v);
    v.onloadedmetadata = done;
    v.onerror = () => reject(new Error("Nie można zdekodować strumienia wideo w tej przeglądarce."));
    window.setTimeout(() => (v.readyState >= 1 ? done() : reject(new Error("Przekroczono czas analizy pliku."))), 20000);
    v.src = url;
  });
}

async function estimateFps(video: HTMLVideoElement): Promise<number> {
  const anyVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number; presentedFrames: number }) => void) => number;
  };
  if (typeof anyVideo.requestVideoFrameCallback !== "function") return 30;
  return new Promise<number>((resolve) => {
    let first: { t: number; f: number } | null = null;
    let settled = false;
    const finish = (fps: number) => {
      if (settled) return;
      settled = true;
      video.pause();
      resolve(fps);
    };
    const step = (_now: number, meta: { mediaTime: number; presentedFrames: number }) => {
      if (!first) first = { t: meta.mediaTime, f: meta.presentedFrames };
      else {
        const dt = meta.mediaTime - first.t;
        const df = meta.presentedFrames - first.f;
        if (dt > 0.28 && df > 4) {
          const raw = df / dt;
          const common = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 120];
          const near = common.reduce((a, b) => (Math.abs(b - raw) < Math.abs(a - raw) ? b : a), 30);
          return finish(Math.abs(near - raw) < 2.2 ? near : Math.round(raw * 100) / 100);
        }
      }
      anyVideo.requestVideoFrameCallback!(step);
    };
    anyVideo.requestVideoFrameCallback!(step);
    video.play().catch(() => finish(30));
    window.setTimeout(() => finish(30), 2500);
  });
}

async function grabPoster(video: HTMLVideoElement, width = 320): Promise<string | undefined> {
  try {
    const target = Math.min(video.duration * 0.08 + 0.05, Math.max(0.05, video.duration - 0.05));
    await seek(video, isFinite(target) ? target : 0);
    const ratio = video.videoHeight / video.videoWidth || 0.5625;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return undefined;
  }
}

export function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };
    video.addEventListener("seeked", onSeeked);
    try {
      video.currentTime = time;
    } catch {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }
    window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      resolve();
    }, 4000);
  });
}

async function probeVideo(url: string): Promise<VideoProbe> {
  const v = await loadVideo(url);
  const fps = await estimateFps(v);
  const thumbnail = await grabPoster(v);
  const result: VideoProbe = {
    duration: isFinite(v.duration) ? v.duration : 0,
    width: v.videoWidth,
    height: v.videoHeight,
    fps,
    thumbnail,
    playable: v.videoWidth > 0,
  };
  v.src = "";
  v.load();
  return result;
}

function probeImage(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Nie można odczytać obrazu."));
    img.src = url;
  });
}

export interface ProbeOutcome {
  asset: MediaAsset;
  url: string;
  warnings: string[];
}

const MAX_DECODE_BYTES = 320 * 1024 * 1024;

/** Full metadata analysis for one file. Never throws for recoverable issues. */
export async function probeMediaFile(
  file: File,
  onStage?: (stage: string) => void,
): Promise<ProbeOutcome> {
  const kind = kindOf(file);
  if (!kind) throw new Error(`Nieobsługiwany typ pliku: ${file.name}`);
  const url = URL.createObjectURL(file);
  const warnings: string[] = [];
  const base = {
    id: uid(kind),
    name: file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    mimeType: file.type || `${kind}/${extOf(file.name)}`,
    size: file.size,
    importedAt: Date.now(),
  };

  if (kind === "image") {
    onStage?.("Analiza obrazu");
    const { width, height } = await probeImage(url);
    const asset: ImageAsset = { ...base, kind: "image", width, height, thumbnail: url };
    return { asset, url, warnings };
  }

  onStage?.("Odczyt kontenera");
  const sniff = await sniffCodecs(file);

  if (kind === "video") {
    onStage?.("Analiza strumienia wideo");
    let probe: VideoProbe;
    try {
      probe = await probeVideo(url);
    } catch (err) {
      warnings.push(
        `${file.name}: przeglądarka nie potrafi zdekodować tego strumienia (${sniff.video ?? "nieznany kodek"}). ` +
          `Plik został dodany do biblioteki — do transkodowania użyj silnika FFmpeg.`,
      );
      probe = { duration: 0, width: 0, height: 0, fps: 30, playable: false };
    }
    let peaks: number[] | undefined;
    let channels = 0;
    let sampleRate = 48000;
    if (file.size < MAX_DECODE_BYTES) {
      onStage?.("Dekodowanie ścieżki audio");
      try {
        const buf = await decodeAudio(file);
        if (buf) {
          peaks = await computePeaksAsync(buf, 2400);
          channels = buf.numberOfChannels;
          sampleRate = buf.sampleRate;
        }
      } catch {
        /* audio track not decodable in this browser — handled below */
      }
    } else {
      warnings.push(`${file.name}: plik jest bardzo duży — pominięto analizę przebiegu audio.`);
    }
    const asset: VideoAsset = {
      ...base,
      kind: "video",
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      videoCodec: sniff.video ?? "nieznany",
      audioCodec: sniff.audio,
      hasAudio: channels > 0 || !!sniff.audio,
      audioChannels: channels || (sniff.audio ? 2 : 0),
      sampleRate,
      thumbnail: probe.thumbnail,
      peaks,
    };
    return { asset, url, warnings };
  }

  onStage?.("Dekodowanie audio");
  let duration = 0;
  let sampleRate = 48000;
  let channels = 2;
  let peaks: number[] | undefined;
  try {
    const buf = await decodeAudio(file);
    if (buf) {
      duration = buf.duration;
      sampleRate = buf.sampleRate;
      channels = buf.numberOfChannels;
      peaks = await computePeaksAsync(buf, 2400);
    }
  } catch {
    warnings.push(`${file.name}: nie udało się zdekodować audio (${sniff.audio ?? "nieznany kodek"}).`);
  }
  if (!duration) {
    duration = await new Promise<number>((resolve) => {
      const a = new Audio();
      a.preload = "metadata";
      a.onloadedmetadata = () => resolve(isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => resolve(0);
      a.src = url;
    });
  }
  const asset: AudioAsset = {
    ...base,
    kind: "audio",
    duration,
    sampleRate,
    channels,
    audioCodec: sniff.audio ?? extOf(file.name).toUpperCase(),
    peaks,
  };
  return { asset, url, warnings };
}
