import type {
  AudioAsset,
  AudioClip,
  ColorGrade,
  Crop,
  Effect,
  EffectType,
  Project,
  SubtitleClip,
  TextClip,
  TextStyle,
  Track,
  Transform,
  VideoAsset,
  VideoClip,
} from "@/types";
import { uid } from "@/utils/format";

export const defaultTransform = (): Transform => ({
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
});

export const defaultCrop = (): Crop => ({ top: 0, bottom: 0, left: 0, right: 0 });

export const defaultColor = (): ColorGrade => ({
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
});

export const defaultTextStyle = (): TextStyle => ({
  fontFamily: '"Roboto Flex", system-ui, sans-serif',
  fontSize: 72,
  bold: true,
  italic: false,
  align: "center",
  color: "#ffffff",
  opacity: 1,
  background: "#000000",
  backgroundOpacity: 0,
  strokeColor: "#000000",
  strokeWidth: 0,
  shadow: true,
  shadowBlur: 18,
  letterSpacing: 0,
  lineHeight: 1.2,
});

export const subtitleStyle = (): TextStyle => ({
  ...defaultTextStyle(),
  fontSize: 46,
  bold: false,
  backgroundOpacity: 0.45,
  shadowBlur: 10,
});

export const EFFECT_DEFAULTS: Record<EffectType, { label: string; icon: string; params: Record<string, number>; color?: string }> = {
  blur: { label: "Rozmycie", icon: "blur_on", params: { radius: 6 } },
  sharpen: { label: "Wyostrzenie", icon: "deblur", params: { amount: 0.5, radius: 1.2 } },
  brightness: { label: "Jasność", icon: "light_mode", params: { amount: 0.15 } },
  contrast: { label: "Kontrast", icon: "contrast", params: { amount: 0.2 } },
  saturation: { label: "Nasycenie", icon: "palette", params: { amount: 0.25 } },
  grayscale: { label: "Czarno-biały", icon: "filter_b_and_w", params: { amount: 1 } },
  sepia: { label: "Sepia", icon: "filter_vintage", params: { amount: 0.8 } },
  hue: { label: "Przesunięcie barw", icon: "colorize", params: { angle: 45 } },
  invert: { label: "Negatyw", icon: "invert_colors", params: { amount: 1 } },
  vignette: { label: "Winieta", icon: "vignette", params: { amount: 0.5, size: 0.45 } },
  noise: { label: "Ziarno", icon: "grain", params: { amount: 0.25 } },
  glow: { label: "Poświata", icon: "flare", params: { amount: 0.4, radius: 14 } },
  shadow: { label: "Cień", icon: "shadow", params: { x: 0, y: 10, blur: 18 }, color: "rgba(0,0,0,0.6)" },
  colorize: { label: "Koloryzacja", icon: "format_color_fill", params: { amount: 0.4 }, color: "#4a5bb9" },
};

export function createEffect(type: EffectType): Effect {
  const def = EFFECT_DEFAULTS[type];
  return { id: uid("fx"), type, enabled: true, params: { ...def.params }, color: def.color };
}

export function createTracks(): Track[] {
  return [
    { id: uid("trk"), kind: "video", name: "V2", height: 68, locked: false, hidden: false, opacity: 1 },
    { id: uid("trk"), kind: "video", name: "V1", height: 76, locked: false, hidden: false, opacity: 1 },
    { id: uid("trk"), kind: "audio", name: "A1", height: 62, locked: false, hidden: false, volume: 1, pan: 0, muted: false, solo: false },
    { id: uid("trk"), kind: "audio", name: "A2", height: 62, locked: false, hidden: false, volume: 1, pan: 0, muted: false, solo: false },
    { id: uid("trk"), kind: "subtitle", name: "S1", height: 46, locked: false, hidden: false },
  ];
}

export function createEmptyProject(name = "Projekt bez tytułu"): Project {
  return {
    id: uid("prj"),
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      aspectRatio: "16:9",
      sampleRate: 48000,
      backgroundColor: "#000000",
    },
    assets: [],
    tracks: createTracks(),
    clips: [],
    markers: [],
  };
}

export function createVideoClip(asset: VideoAsset, trackId: string, start: number): VideoClip {
  const duration = Math.max(0.1, asset.duration || 5);
  return {
    id: uid("clip"),
    type: "video",
    trackId,
    start,
    duration,
    label: asset.name,
    assetId: asset.id,
    inPoint: 0,
    outPoint: duration,
    speed: 1,
    reverse: false,
    freezeFrame: false,
    transform: defaultTransform(),
    crop: defaultCrop(),
    opacity: 1,
    blendMode: "normal",
    color: defaultColor(),
    effects: [],
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export function createImageClip(assetId: string, label: string, trackId: string, start: number): VideoClip {
  return {
    id: uid("clip"),
    type: "video",
    trackId,
    start,
    duration: 5,
    label,
    assetId,
    inPoint: 0,
    outPoint: 5,
    speed: 1,
    reverse: false,
    freezeFrame: false,
    transform: defaultTransform(),
    crop: defaultCrop(),
    opacity: 1,
    blendMode: "normal",
    color: defaultColor(),
    effects: [],
    volume: 1,
    muted: true,
    fadeIn: 0,
    fadeOut: 0,
  };
}

export function createAudioClip(asset: AudioAsset, trackId: string, start: number): AudioClip {
  const duration = Math.max(0.1, asset.duration || 5);
  return {
    id: uid("clip"),
    type: "audio",
    trackId,
    start,
    duration,
    label: asset.name,
    assetId: asset.id,
    inPoint: 0,
    outPoint: duration,
    speed: 1,
    volume: 1,
    gain: 1,
    pan: 0,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    reverse: false,
  };
}

export function createTextClip(trackId: string, start: number, text = "Nowy tekst"): TextClip {
  return {
    id: uid("clip"),
    type: "text",
    trackId,
    start,
    duration: 4,
    label: text.slice(0, 24),
    text,
    style: defaultTextStyle(),
    transform: defaultTransform(),
    animation: "fade",
    effects: [],
  };
}

export function createSubtitleClip(
  trackId: string,
  start: number,
  end: number,
  text: string,
  sourceAssetId?: string,
): SubtitleClip {
  return {
    id: uid("clip"),
    type: "subtitle",
    trackId,
    start,
    duration: Math.max(0.3, end - start),
    label: text.slice(0, 24),
    text,
    style: subtitleStyle(),
    positionY: 0.86,
    sourceAssetId,
  };
}
