import type { ExportProfile, ExportQuality, ExportSettings } from "@/types";

export const QUALITY_MULTIPLIER: Record<Exclude<ExportQuality, "custom">, number> = {
  low: 0.5,
  medium: 0.85,
  high: 1.3,
  veryhigh: 2.1,
};

/** Reference bitrate (kbps) for 1080p30 H.264 at "high" quality. */
export function recommendedBitrate(
  width: number,
  height: number,
  fps: number,
  codec: ExportSettings["videoCodec"],
  quality: ExportQuality,
): number {
  const pixels = width * height;
  const base = (pixels / (1920 * 1080)) * 8000 * (fps / 30);
  const codecFactor = codec === "h265" ? 0.62 : codec === "av1" ? 0.55 : codec === "vp9" ? 0.75 : 1;
  const q = quality === "custom" ? 1 : QUALITY_MULTIPLIER[quality];
  return Math.max(400, Math.round(base * codecFactor * q));
}

export function estimateFileSize(settings: ExportSettings, durationSec: number): number {
  const videoBits = settings.videoBitrate * 1000 * durationSec;
  const audioBits = (settings.audioCodec === "none" ? 0 : settings.audioBitrate * 1000) * durationSec;
  return (videoBits + audioBits) / 8;
}

export const EXPORT_PROFILES: ExportProfile[] = [
  {
    id: "custom",
    name: "Własny",
    icon: "tune",
    description: "Pełna kontrola nad wszystkimi parametrami",
    patch: {},
  },
  {
    id: "youtube-1080p",
    name: "YouTube 1080p",
    icon: "smart_display",
    description: "MP4 · H.264 · 1920×1080 · 30 fps · 12 Mb/s",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080, fps: 30, videoBitrate: 12000, audioBitrate: 192 },
  },
  {
    id: "youtube-4k",
    name: "YouTube 4K",
    icon: "4k",
    description: "MP4 · H.265 · 3840×2160 · 60 fps · 45 Mb/s",
    patch: { container: "mp4", videoCodec: "h265", audioCodec: "aac", width: 3840, height: 2160, fps: 60, videoBitrate: 45000, audioBitrate: 256 },
  },
  {
    id: "instagram-reel",
    name: "Instagram Reel",
    icon: "photo_camera",
    description: "MP4 · H.264 · 1080×1920 · 30 fps",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, videoBitrate: 9000, audioBitrate: 160 },
  },
  {
    id: "instagram-post",
    name: "Instagram Post",
    icon: "crop_square",
    description: "MP4 · H.264 · 1080×1080 · 30 fps",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1080, fps: 30, videoBitrate: 8000, audioBitrate: 160 },
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: "music_note",
    description: "MP4 · H.264 · 1080×1920 · 30 fps",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, videoBitrate: 10000, audioBitrate: 192 },
  },
  {
    id: "facebook",
    name: "Facebook",
    icon: "thumb_up",
    description: "MP4 · H.264 · 1280×720 · 30 fps",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1280, height: 720, fps: 30, videoBitrate: 6000, audioBitrate: 128 },
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    icon: "work",
    description: "MP4 · H.264 · 1920×1080 · 30 fps",
    patch: { container: "mp4", videoCodec: "h264", audioCodec: "aac", width: 1920, height: 1080, fps: 30, videoBitrate: 10000, audioBitrate: 160 },
  },
  {
    id: "web-vp9",
    name: "Web VP9",
    icon: "public",
    description: "WebM · VP9 · Opus · 1920×1080",
    patch: { container: "webm", videoCodec: "vp9", audioCodec: "opus", width: 1920, height: 1080, fps: 30, videoBitrate: 8000, audioBitrate: 128 },
  },
  {
    id: "web-av1",
    name: "Web AV1",
    icon: "bolt",
    description: "WebM · AV1 · Opus · 1920×1080",
    patch: { container: "webm", videoCodec: "av1", audioCodec: "opus", width: 1920, height: 1080, fps: 30, videoBitrate: 6000, audioBitrate: 128 },
  },
];

export const RESOLUTION_PRESETS = [
  { label: "720p", width: 1280, height: 720 },
  { label: "1080p", width: 1920, height: 1080 },
  { label: "1440p", width: 2560, height: 1440 },
  { label: "4K", width: 3840, height: 2160 },
];

export const PROJECT_RESOLUTION_PRESETS = [
  { label: "1920 × 1080 · 16:9", width: 1920, height: 1080, aspect: "16:9" as const },
  { label: "3840 × 2160 · 16:9", width: 3840, height: 2160, aspect: "16:9" as const },
  { label: "1280 × 720 · 16:9", width: 1280, height: 720, aspect: "16:9" as const },
  { label: "1080 × 1920 · 9:16", width: 1080, height: 1920, aspect: "9:16" as const },
  { label: "1080 × 1080 · 1:1", width: 1080, height: 1080, aspect: "1:1" as const },
  { label: "2160 × 3840 · 9:16", width: 2160, height: 3840, aspect: "9:16" as const },
  { label: "1440 × 1080 · 4:3", width: 1440, height: 1080, aspect: "4:3" as const },
  { label: "1080 × 1350 · 4:5", width: 1080, height: 1350, aspect: "4:5" as const },
];

export const FPS_OPTIONS = [24, 25, 30, 50, 60];
