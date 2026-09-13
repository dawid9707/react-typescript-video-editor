import type { ExportContainer, ExportVideoCodec, ExportAudioCodec } from "@/types";

export interface Capabilities {
  mediaRecorder: boolean;
  webCodecs: boolean;
  offscreenCanvas: boolean;
  captureStream: boolean;
  fileSystemAccess: boolean;
  sharedArrayBuffer: boolean;
  crossOriginIsolated: boolean;
  webWorkers: boolean;
  indexedDb: boolean;
  recorderMimeTypes: string[];
}

export interface ExportFormat {
  extension: string;
  mime: string;
}

export function exportFormat(container: ExportContainer): ExportFormat {
  switch (container) {
    case "mp4":
      return { extension: "mp4", mime: "video/mp4" };
    case "mkv":
      return { extension: "mkv", mime: "video/x-matroska" };
    case "gif":
      return { extension: "gif", mime: "image/gif" };
    case "webm":
    default:
      return { extension: "webm", mime: "video/webm" };
  }
}

const CANDIDATE_MIMES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  'video/mp4;codecs="hvc1.1.6.L93.B0,mp4a.40.2"',
  "video/mp4",
  'video/webm;codecs="vp9,opus"',
  'video/webm;codecs="vp8,opus"',
  'video/webm;codecs="av01,opus"',
  "video/webm",
];

export function detectCapabilities(): Capabilities {
  const recorderMimeTypes =
    typeof MediaRecorder !== "undefined"
      ? CANDIDATE_MIMES.filter((m) => {
          try {
            return MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        })
      : [];
  return {
    mediaRecorder: typeof MediaRecorder !== "undefined",
    webCodecs: typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder !== "undefined",
    offscreenCanvas: typeof OffscreenCanvas !== "undefined",
    captureStream: typeof HTMLCanvasElement !== "undefined" && "captureStream" in HTMLCanvasElement.prototype,
    fileSystemAccess: typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function",
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    crossOriginIsolated: typeof crossOriginIsolated !== "undefined" ? crossOriginIsolated : false,
    webWorkers: typeof Worker !== "undefined",
    indexedDb: typeof indexedDB !== "undefined",
    recorderMimeTypes,
  };
}

export const capabilities: Capabilities = detectCapabilities();

const CODEC_TAG: Record<ExportVideoCodec, string[]> = {
  h264: ["avc1.640028", "avc1.42E01E", "avc1"],
  h265: ["hvc1.1.6.L93.B0", "hev1.1.6.L93.B0"],
  vp9: ["vp9", "vp09.00.10.08"],
  vp8: ["vp8"],
  av1: ["av01.0.08M.08", "av01"],
};

const AUDIO_TAG: Record<ExportAudioCodec, string[]> = {
  aac: ["mp4a.40.2"],
  opus: ["opus"],
  vorbis: ["vorbis"],
  none: [],
};

/** Finds a MediaRecorder mime string for the requested combination, or null. */
export function findRecorderMime(
  container: ExportContainer,
  video: ExportVideoCodec,
  audio: ExportAudioCodec,
): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (container !== "mp4" && container !== "webm") return null;
  const base = container === "mp4" ? "video/mp4" : "video/webm";
  for (const v of CODEC_TAG[video]) {
    const audioTags = AUDIO_TAG[audio].length ? AUDIO_TAG[audio] : [null];
    for (const a of audioTags) {
      const mime = `${base};codecs="${a ? `${v},${a}` : v}"`;
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
  }
  return null;
}

export function recorderSupports(container: ExportContainer, video: ExportVideoCodec, audio: ExportAudioCodec): boolean {
  return findRecorderMime(container, video, audio) !== null;
}

/** Best available recorder mime — used as an intermediate for FFmpeg transcoding. */
export function bestIntermediateMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const order = [
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
    "video/webm",
    'video/mp4;codecs="avc1.640028,mp4a.40.2"',
    "video/mp4",
  ];
  return order.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export async function webCodecsSupports(codec: string, width: number, height: number, fps: number): Promise<boolean> {
  const VE = (window as unknown as { VideoEncoder?: { isConfigSupported(c: unknown): Promise<{ supported?: boolean }> } })
    .VideoEncoder;
  if (!VE) return false;
  try {
    const res = await VE.isConfigSupported({
      codec,
      width,
      height,
      framerate: fps,
      bitrate: 6_000_000,
    });
    return !!res.supported;
  } catch {
    return false;
  }
}
