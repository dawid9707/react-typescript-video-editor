import type { ThemeMode } from "@/types";

/* ------------------------------------------------------------------
 * Dynamic colour: builds Material 3 tonal palettes from a seed colour.
 * Uses OKLab/OKLCH (perceptually uniform) as a practical stand-in for
 * HCT, with chroma-clipping into the sRGB gamut.
 * ------------------------------------------------------------------ */

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function rgbToOklch(rgb: RGB): { L: number; C: number; H: number } {
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(a * a + bb * bb);
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

function oklchToRgb(L: number, C: number, H: number): RGB {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return {
    r: toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

const inGamut = (c: RGB) =>
  c.r >= -0.001 && c.r <= 1.001 && c.g >= -0.001 && c.g <= 1.001 && c.b >= -0.001 && c.b <= 1.001;

function oklchToHex(L: number, C: number, H: number): string {
  let c = C;
  let rgb = oklchToRgb(L, c, H);
  let guard = 0;
  while (!inGamut(rgb) && guard++ < 40) {
    c *= 0.92;
    rgb = oklchToRgb(L, c, H);
  }
  const to255 = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to255(rgb.r)}${to255(rgb.g)}${to255(rgb.b)}`;
}

/** Material tone (0 = black … 100 = white) mapped onto OKLab lightness. */
const toneToL = (tone: number) => Math.pow(tone / 100, 1 / 1.18);

function palette(hue: number, chroma: number) {
  return (tone: number) => oklchToHex(toneToL(tone), chroma * (1 - Math.abs(tone - 55) / 130), hue);
}

export interface Scheme {
  [token: string]: string;
}

export function buildScheme(seedHex: string, mode: "light" | "dark" | "amoled"): Scheme {
  const seed = rgbToOklch(hexToRgb(seedHex));
  const hue = seed.H;
  const primary = palette(hue, Math.max(0.13, Math.min(0.2, seed.C * 1.1)));
  const secondary = palette(hue, 0.05);
  const tertiary = palette((hue + 60) % 360, 0.09);
  const neutral = palette(hue, 0.006);
  const neutralVariant = palette(hue, 0.018);
  const error = palette(27, 0.17);

  if (mode === "light") {
    return {
      "--md-primary": primary(40),
      "--md-on-primary": primary(100),
      "--md-primary-container": primary(90),
      "--md-on-primary-container": primary(10),
      "--md-secondary": secondary(40),
      "--md-on-secondary": secondary(100),
      "--md-secondary-container": secondary(90),
      "--md-on-secondary-container": secondary(10),
      "--md-tertiary": tertiary(40),
      "--md-on-tertiary": tertiary(100),
      "--md-tertiary-container": tertiary(90),
      "--md-on-tertiary-container": tertiary(10),
      "--md-error": error(40),
      "--md-on-error": error(100),
      "--md-error-container": error(90),
      "--md-on-error-container": error(10),
      "--md-background": neutral(98),
      "--md-on-background": neutral(10),
      "--md-surface": neutral(98),
      "--md-on-surface": neutral(10),
      "--md-surface-variant": neutralVariant(90),
      "--md-on-surface-variant": neutralVariant(30),
      "--md-surface-container-lowest": neutral(100),
      "--md-surface-container-low": neutral(96),
      "--md-surface-container": neutral(94),
      "--md-surface-container-high": neutral(92),
      "--md-surface-container-highest": neutral(90),
      "--md-outline": neutralVariant(50),
      "--md-outline-variant": neutralVariant(80),
      "--md-inverse-surface": neutral(20),
      "--md-inverse-on-surface": neutral(95),
      "--md-inverse-primary": primary(80),
      "--md-track-video": primary(45),
      "--md-track-audio": oklchToHex(toneToL(45), 0.11, 158),
      "--md-track-text": oklchToHex(toneToL(48), 0.13, 65),
      "--md-track-subtitle": oklchToHex(toneToL(48), 0.13, 305),
    };
  }

  const amoled = mode === "amoled";
  return {
    "--md-primary": primary(80),
    "--md-on-primary": primary(20),
    "--md-primary-container": primary(30),
    "--md-on-primary-container": primary(90),
    "--md-secondary": secondary(80),
    "--md-on-secondary": secondary(20),
    "--md-secondary-container": secondary(30),
    "--md-on-secondary-container": secondary(90),
    "--md-tertiary": tertiary(80),
    "--md-on-tertiary": tertiary(20),
    "--md-tertiary-container": tertiary(30),
    "--md-on-tertiary-container": tertiary(90),
    "--md-error": error(80),
    "--md-on-error": error(20),
    "--md-error-container": error(30),
    "--md-on-error-container": error(90),
    "--md-background": amoled ? "#000000" : neutral(6),
    "--md-on-background": neutral(90),
    "--md-surface": amoled ? "#000000" : neutral(6),
    "--md-on-surface": neutral(90),
    "--md-surface-variant": neutralVariant(30),
    "--md-on-surface-variant": neutralVariant(80),
    "--md-surface-container-lowest": amoled ? "#000000" : neutral(4),
    "--md-surface-container-low": amoled ? neutral(5) : neutral(10),
    "--md-surface-container": amoled ? neutral(8) : neutral(12),
    "--md-surface-container-high": amoled ? neutral(12) : neutral(17),
    "--md-surface-container-highest": amoled ? neutral(16) : neutral(22),
    "--md-outline": neutralVariant(60),
    "--md-outline-variant": amoled ? neutralVariant(22) : neutralVariant(30),
    "--md-inverse-surface": neutral(90),
    "--md-inverse-on-surface": neutral(20),
    "--md-inverse-primary": primary(40),
    "--md-track-video": primary(60),
    "--md-track-audio": oklchToHex(toneToL(62), 0.12, 158),
    "--md-track-text": oklchToHex(toneToL(66), 0.13, 65),
    "--md-track-subtitle": oklchToHex(toneToL(64), 0.13, 305),
  };
}

export function resolveMode(theme: ThemeMode): "light" | "dark" | "amoled" {
  if (theme === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

export function applyTheme(theme: ThemeMode, accent: string): void {
  const mode = resolveMode(theme);
  const scheme = buildScheme(accent, mode);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(scheme)) root.style.setProperty(k, v);
  root.style.colorScheme = mode === "light" ? "light" : "dark";
  root.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", scheme["--md-surface"]);
}

export const ACCENT_PRESETS: { name: string; value: string }[] = [
  { name: "Indygo", value: "#4a5bb9" },
  { name: "Błękit", value: "#0b6bcb" },
  { name: "Cyjan", value: "#00687a" },
  { name: "Zieleń", value: "#2e6b41" },
  { name: "Limonka", value: "#5f6b1f" },
  { name: "Bursztyn", value: "#8a5100" },
  { name: "Koral", value: "#b3261e" },
  { name: "Magenta", value: "#8e2c6b" },
  { name: "Fiolet", value: "#6750a4" },
  { name: "Grafit", value: "#4b5563" },
];
