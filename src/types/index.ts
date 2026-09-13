/* ------------------------------------------------------------------
 * Material Video Studio — domain model
 * ------------------------------------------------------------------ */

export type ThemeMode = "system" | "light" | "dark" | "amoled";

export type MediaKind = "video" | "audio" | "image" | "subtitle";

export interface MediaAssetBase {
  id: string;
  name: string;
  kind: MediaKind;
  /** original file name */
  fileName: string;
  mimeType: string;
  /** bytes */
  size: number;
  importedAt: number;
  /** true when the underlying binary is missing in this session */
  offline?: boolean;
}

export interface VideoAsset extends MediaAssetBase {
  kind: "video";
  duration: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string | null;
  hasAudio: boolean;
  audioChannels: number;
  sampleRate: number;
  /** data-url poster */
  thumbnail?: string;
  /** normalised (0..1) peak pairs for the embedded audio, if decoded */
  peaks?: number[];
}

export interface AudioAsset extends MediaAssetBase {
  kind: "audio";
  duration: number;
  sampleRate: number;
  channels: number;
  audioCodec: string;
  peaks?: number[];
}

export interface ImageAsset extends MediaAssetBase {
  kind: "image";
  width: number;
  height: number;
  thumbnail?: string;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface SubtitleAsset extends MediaAssetBase {
  kind: "subtitle";
  format: "srt" | "vtt";
  cues: SubtitleCue[];
  duration: number;
}

export type MediaAsset = VideoAsset | AudioAsset | ImageAsset | SubtitleAsset;

/* ----------------------------- tracks ----------------------------- */

export type TrackKind = "video" | "audio" | "subtitle";

export interface TrackBase {
  id: string;
  kind: TrackKind;
  name: string;
  height: number;
  locked: boolean;
  hidden: boolean;
}

export interface VideoTrack extends TrackBase {
  kind: "video";
  opacity: number;
}

export interface AudioTrack extends TrackBase {
  kind: "audio";
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface SubtitleTrack extends TrackBase {
  kind: "subtitle";
}

export type Track = VideoTrack | AudioTrack | SubtitleTrack;

/* ----------------------------- effects ---------------------------- */

export type EffectType =
  | "blur"
  | "sharpen"
  | "brightness"
  | "contrast"
  | "saturation"
  | "grayscale"
  | "sepia"
  | "hue"
  | "invert"
  | "vignette"
  | "noise"
  | "glow"
  | "shadow"
  | "colorize"
  | "vhs"
  | "glitch"
  | "pixelate"
  | "scanlines"
  | "cinema";
  | "enhance"
  | "stabilize";

export interface Effect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
  /** colorize / shadow tint */
  color?: string;
}

export type TransitionType =
  | "cut"
  | "dissolve"
  | "fade"
  | "dipToBlack"
  | "dipToWhite"
  | "slide"
  | "push"
  | "zoom";

export interface Transition {
  id: string;
  type: TransitionType;
  duration: number;
  direction?: "left" | "right" | "up" | "down";
}

/* ------------------------------ clips ----------------------------- */

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export interface Crop {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface BlurRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  shape: "rectangle" | "ellipse";
}

export interface BlurClip extends ClipBase {
  type: "blur";
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  shape: "rectangle" | "ellipse";
}

export interface ColorGrade {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "luminosity";

export interface ClipBase {
  id: string;
  trackId: string;
  /** timeline position, seconds */
  start: number;
  /** timeline length, seconds (already speed adjusted) */
  duration: number;
  label: string;
  selected?: boolean;
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface VideoClip extends ClipBase {
  type: "video";
  assetId: string;
  /** source in-point, seconds (source time base) */
  inPoint: number;
  /** source out-point, seconds */
  outPoint: number;
  speed: number;
  reverse: boolean;
  freezeFrame: boolean;
  transform: Transform;
  crop: Crop;
  opacity: number;
  blendMode: BlendMode;
  color: ColorGrade;
  effects: Effect[];
  blurRegion?: BlurRegion;
  volume: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  noiseReduction: number;
  voiceEnhance: number;
  compressor: number;
}

export interface AudioClip extends ClipBase {
  type: "audio";
  assetId: string;
  inPoint: number;
  outPoint: number;
  speed: number;
  volume: number;
  gain: number;
  pan: number;
  muted: boolean;
  fadeIn: number;
  fadeOut: number;
  reverse: boolean;
  noiseReduction: number;
  voiceEnhance: number;
  compressor: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  color: string;
  opacity: number;
  hasBackground?: boolean;
  background: string;
  backgroundOpacity: number;
  hasStroke?: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowBlur: number;
  letterSpacing: number;
  lineHeight: number;
}

export type TextAnimation = "none" | "fade" | "slideUp" | "popIn" | "typewriter";

export interface TextClip extends ClipBase {
  type: "text";
  text: string;
  style: TextStyle;
  transform: Transform;
  animation: TextAnimation;
  effects: Effect[];
}

export interface SubtitleClip extends ClipBase {
  type: "subtitle";
  text: string;
  style: TextStyle;
  /** vertical placement 0..1 (1 = bottom) */
  positionY: number;
  sourceAssetId?: string;
}

export type ShapeType = "rectangle" | "ellipse" | "line" | "arrow";

export interface ShapeClip extends ClipBase {
  type: "shape";
  shape: ShapeType;
  transform: Transform;
  width: number;
  height: number;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  cornerRadius: number;
}

export type Clip = VideoClip | AudioClip | TextClip | SubtitleClip | ShapeClip | BlurClip;

/* ----------------------------- markers ---------------------------- */

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
  note: string;
}

/* ----------------------------- project ---------------------------- */

export type AspectRatioPreset = "16:9" | "9:16" | "1:1" | "4:3" | "4:5" | "21:9" | "custom";

export interface ProjectSettings {
  width: number;
  height: number;
  fps: number;
  aspectRatio: AspectRatioPreset;
  sampleRate: number;
  backgroundColor: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  settings: ProjectSettings;
  assets: MediaAsset[];
  tracks: Track[];
  clips: Clip[];
  markers: Marker[];
}

/* ------------------------------ export ---------------------------- */

export type ExportContainer = "mp4" | "webm" | "mkv" | "gif";
export type ExportVideoCodec = "h264" | "h265" | "vp9" | "vp8" | "av1";
export type ExportAudioCodec = "aac" | "opus" | "vorbis" | "none";
export type ExportQuality = "low" | "medium" | "high" | "veryhigh" | "custom";
export type ExportEngineId = "mediarecorder" | "backend";
export type ExportDestination = "download" | "filesystem";

export interface ExportSettings {
  profileId: string;
  container: ExportContainer;
  videoCodec: ExportVideoCodec;
  audioCodec: ExportAudioCodec;
  width: number;
  height: number;
  fps: number;
  quality: ExportQuality;
  videoBitrate: number; // kbps
  audioBitrate: number; // kbps
  sampleRate: number;
  engine: ExportEngineId;
  destination: ExportDestination;
  burnSubtitles: boolean;
  rangeStart: number | null;
  rangeEnd: number | null;
}

export interface ExportProfile {
  id: string;
  name: string;
  icon: string;
  description: string;
  patch: Partial<ExportSettings>;
}

export type ExportPhase =
  | "idle"
  | "preparing"
  | "rendering"
  | "transcoding"
  | "finalizing"
  | "done"
  | "error"
  | "cancelled";

export interface ExportProgress {
  phase: ExportPhase;
  ratio: number;
  message: string;
  startedAt: number;
  elapsed: number;
  remaining: number | null;
}

/* ------------------------------- misc ----------------------------- */

export interface SnackbarMessage {
  id: string;
  text: string;
  action?: string;
  onAction?: () => void;
  tone?: "normal" | "error";
  duration?: number;
}

export interface AppSettings {
  theme: ThemeMode;
  accent: string;
  snapping: boolean;
  autoSave: boolean;
  showWaveforms: boolean;
  timelineZoom: number;
  backendUrl: string;
}
