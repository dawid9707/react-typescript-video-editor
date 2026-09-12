import type {
  Clip,
  ColorGrade,
  Effect,
  MediaAsset,
  Project,
  SubtitleClip,
  TextClip,
  TextStyle,
  Transform,
  Transition,
  VideoClip,
} from "@/types";
import { clamp } from "@/utils/format";
import { mediaPool } from "@/services/media/pool";
import { clipEnd, isSubtitleClip, isTextClip, isVideoClip } from "@/features/timeline/selectors";

export type Drawable = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;

export interface RenderOptions {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  project: Project;
  time: number;
  assets: Map<string, MediaAsset>;
  /** when false, effect passes that need extra canvases are skipped (scrubbing) */
  highQuality?: boolean;
  showSubtitles?: boolean;
}

/* ------------------------- helper canvases ------------------------- */

const scratch = {
  a: null as HTMLCanvasElement | null,
  b: null as HTMLCanvasElement | null,
  noise: null as HTMLCanvasElement | null,
};

function scratchCanvas(which: "a" | "b", w: number, h: number): HTMLCanvasElement {
  let c = scratch[which];
  if (!c) {
    c = document.createElement("canvas");
    scratch[which] = c;
  }
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

function noiseTile(): HTMLCanvasElement {
  if (scratch.noise) return scratch.noise;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  scratch.noise = c;
  return c;
}

/* --------------------------- colour math --------------------------- */

export function gradeToFilter(color: ColorGrade, effects: Effect[]): string {
  const parts: string[] = [];
  const brightness = 1 + color.exposure;
  const contrast = 1 + color.contrast;
  const saturate = 1 + color.saturation;
  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`);
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`);
  if (Math.abs(saturate - 1) > 0.001) parts.push(`saturate(${saturate.toFixed(3)})`);
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const p = fx.params;
    switch (fx.type) {
      case "blur":
        if (p.radius > 0) parts.push(`blur(${p.radius.toFixed(2)}px)`);
        break;
      case "brightness":
        parts.push(`brightness(${(1 + p.amount).toFixed(3)})`);
        break;
      case "contrast":
        parts.push(`contrast(${(1 + p.amount).toFixed(3)})`);
        break;
      case "saturation":
        parts.push(`saturate(${(1 + p.amount).toFixed(3)})`);
        break;
      case "grayscale":
        parts.push(`grayscale(${clamp(p.amount, 0, 1).toFixed(3)})`);
        break;
      case "sepia":
        parts.push(`sepia(${clamp(p.amount, 0, 1).toFixed(3)})`);
        break;
      case "hue":
        parts.push(`hue-rotate(${p.angle.toFixed(1)}deg)`);
        break;
      case "invert":
        parts.push(`invert(${clamp(p.amount, 0, 1).toFixed(3)})`);
        break;
      case "shadow":
        parts.push(
          `drop-shadow(${(p.x ?? 0).toFixed(0)}px ${(p.y ?? 8).toFixed(0)}px ${(p.blur ?? 12).toFixed(0)}px ${
            fx.color ?? "rgba(0,0,0,0.65)"
          })`,
        );
        break;
      default:
        break;
    }
  }
  return parts.length ? parts.join(" ") : "none";
}

function drawColorOverlays(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  color: ColorGrade,
): void {
  const { x, y, w, h } = rect;
  if (Math.abs(color.temperature) > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(0.85, Math.abs(color.temperature));
    ctx.fillStyle = color.temperature > 0 ? "#ff8a2b" : "#2b8aff";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (Math.abs(color.tint) > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = Math.min(0.85, Math.abs(color.tint));
    ctx.fillStyle = color.tint > 0 ? "#ff2bd0" : "#4dff5a";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (Math.abs(color.highlights) > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = color.highlights > 0 ? "lighten" : "multiply";
    ctx.globalAlpha = Math.min(0.6, Math.abs(color.highlights) * 0.6);
    ctx.fillStyle = color.highlights > 0 ? "#ffffff" : "#b4b4b4";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (Math.abs(color.shadows) > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = color.shadows > 0 ? "screen" : "darken";
    ctx.globalAlpha = Math.min(0.6, Math.abs(color.shadows) * 0.6);
    ctx.fillStyle = color.shadows > 0 ? "#3a3a3a" : "#000000";
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

function drawPostEffects(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; w: number; h: number },
  effects: Effect[],
  source: Drawable | null,
  time: number,
): void {
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const p = fx.params;
    if (fx.type === "vignette" && p.amount > 0) {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const r = Math.max(rect.w, rect.h) * 0.75;
      const g = ctx.createRadialGradient(cx, cy, r * (1 - clamp(p.size ?? 0.5, 0.05, 0.95)), cx, cy, r);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,0,${clamp(p.amount, 0, 1)})`);
      ctx.save();
      ctx.fillStyle = g;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
    if (fx.type === "noise" && p.amount > 0) {
      const tile = noiseTile();
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = clamp(p.amount, 0, 1) * 0.6;
      const pattern = ctx.createPattern(tile, "repeat");
      if (pattern) {
        ctx.fillStyle = pattern;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      }
      ctx.restore();
    }
    if (fx.type === "colorize" && p.amount > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "color";
      ctx.globalAlpha = clamp(p.amount, 0, 1);
      ctx.fillStyle = fx.color ?? "#4a5bb9";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
    if (fx.type === "glow" && p.amount > 0 && source) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(p.amount, 0, 1) * 0.7;
      ctx.filter = `blur(${(p.radius ?? 12).toFixed(1)}px) brightness(1.3)`;
      ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
    if (fx.type === "pixelate" && p.size > 1 && source) {
      const pxSize = Math.max(2, Math.round(p.size));
      const sw = Math.max(1, Math.round(rect.w / pxSize));
      const sh = Math.max(1, Math.round(rect.h / pxSize));
      const tmp = scratchCanvas("px", sw, sh);
      const tctx = tmp.getContext("2d")!;
      tctx.imageSmoothingEnabled = false;
      tctx.clearRect(0, 0, sw, sh);
      const sW = (source as any).videoWidth || (source as any).naturalWidth || source.width;
      const sH = (source as any).videoHeight || (source as any).naturalHeight || source.height;
      if (sW && sH) {
        tctx.drawImage(source, 0, 0, sW, sH, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, 0, 0, sw, sh, rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
      }
    }
    if (fx.type === "vhs" && source) {
      const bleed = p.bleed ?? 0.5;
      const head = p.head ?? 0.3;
      const tracking = p.tracking ?? 0.2;
      const jitter = p.jitter ?? 0.1;
      const degradeAmt = p.degrade ?? 0.5;

      const sW = (source as any).videoWidth || (source as any).naturalWidth || source.width;
      const sH = (source as any).videoHeight || (source as any).naturalHeight || source.height;
      if (sW && sH) {
        ctx.save();
        
        // Jitter (horizontal shake)
        const frameT = Math.floor(time * 30);
        const jitterShift = jitter > 0 ? (Math.random() - 0.5) * jitter * 20 : 0;
        const jx = rect.x + jitterShift;

        // Base image with luma degradation
        const sat = 1 + (1 - degradeAmt) * 0.5;
        ctx.filter = `sepia(${degradeAmt * 0.6}) saturate(${sat}) brightness(${1 - degradeAmt * 0.1}) contrast(${1 - degradeAmt * 0.2})`;
        ctx.drawImage(source, 0, 0, sW, sH, jx, rect.y, rect.w, rect.h);

        // Chroma bleed (color bleeding & shifting)
        if (bleed > 0) {
          ctx.globalCompositeOperation = "screen";
          ctx.globalAlpha = clamp(bleed, 0, 1) * 0.6;
          const shift = Math.max(1, bleed * 12);
          
          ctx.filter = `sepia(1) hue-rotate(-50deg) saturate(3) blur(${bleed * 2}px)`;
          ctx.drawImage(source, 0, 0, sW, sH, jx - shift, rect.y, rect.w, rect.h);
          
          ctx.filter = `sepia(1) hue-rotate(150deg) saturate(3) blur(${bleed * 2}px)`;
          ctx.drawImage(source, 0, 0, sW, sH, jx + shift, rect.y, rect.w, rect.h);
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.filter = "none";

        // Head switching noise (bottom skew/distortion)
        if (head > 0) {
          const headHeight = Math.max(2, rect.h * head * 0.1);
          const headY = rect.y + rect.h - headHeight;
          const srcHeadY = sH - (sH * head * 0.1);
          const skewX = Math.sin(frameT) * head * 30;
          
          // Clear area and redraw skewed
          ctx.clearRect(rect.x, headY, rect.w, headHeight);
          ctx.drawImage(source, 0, srcHeadY, sW, sH - srcHeadY, rect.x + skewX, headY, rect.w, headHeight);
          // Add static noise over head switching
          ctx.fillStyle = `rgba(255,255,255,${head * 0.5})`;
          for (let i = 0; i < 5; i++) {
            if (Math.random() > 0.5) {
              ctx.fillRect(rect.x, headY + Math.random() * headHeight, rect.w, 1 + Math.random() * 2);
            }
          }
        }

        // Tracking noise (tape damage lines moving up/down)
        if (tracking > 0) {
          ctx.globalCompositeOperation = "overlay";
          ctx.fillStyle = `rgba(255, 255, 255, ${tracking * 0.7})`;
          
          // Primary rolling tracking line
          const noiseY = (time * 150) % rect.h;
          ctx.fillRect(rect.x, rect.y + noiseY, rect.w, 3 + Math.random() * 5);
          ctx.fillRect(rect.x, rect.y + noiseY + 8, rect.w, 1 + Math.random() * 3);
          
          // Random dropouts
          if (Math.random() < tracking) {
            const dropY = rect.y + Math.random() * rect.h;
            ctx.fillStyle = `rgba(0, 0, 0, ${tracking * 0.5})`;
            ctx.fillRect(rect.x, dropY, rect.w, 2 + Math.random() * 4);
          }
        }
        
        ctx.restore();
      }
    }
    if (fx.type === "glitch" && (p.amount ?? 0) > 0 && source) {
      const amountAmt = p.amount ?? 0.3;
      const freqAmt = p.frequency ?? 0.5;
      const splitAmt = p.rgbSplit ?? 0.5;
      const sW = (source as any).videoWidth || (source as any).naturalWidth || source.width;
      const sH = (source as any).videoHeight || (source as any).naturalHeight || source.height;
      if (sW && sH) {
        ctx.save();
        const freqMod = 5 + freqAmt * 15;
        const t = Math.floor(time * freqMod);
        if (Math.sin(t * 13.3) > (1 - freqAmt * 0.8)) {
          const slices = [
            { y: Math.abs(Math.sin(t * 1.1)), h: 0.05 + 0.05 * Math.abs(Math.cos(t)), x: 20 * amountAmt * Math.sin(t * 7) },
            { y: Math.abs(Math.cos(t * 2.3)), h: 0.03 + 0.08 * Math.abs(Math.sin(t)), x: -25 * amountAmt * Math.cos(t * 3) },
            { y: Math.abs(Math.sin(t * 3.7)), h: 0.04 + 0.06 * Math.abs(Math.cos(t * 2)), x: 30 * amountAmt * Math.sin(t * 5) },
          ];
          for (const s of slices) {
            const sy = clamp(s.y, 0, 0.9);
            ctx.drawImage(source, 0, sH * sy, sW, sH * s.h, rect.x + s.x, rect.y + rect.h * sy, rect.w, rect.h * s.h);
            
            if (splitAmt > 0) {
              ctx.globalCompositeOperation = "screen";
              ctx.globalAlpha = clamp(splitAmt, 0, 1) * 0.8;
              ctx.filter = "sepia(1) hue-rotate(-50deg) saturate(4)";
              ctx.drawImage(source, 0, sH * sy, sW, sH * s.h, rect.x + s.x - 15 * splitAmt, rect.y + rect.h * sy, rect.w, rect.h * s.h);
              
              ctx.filter = "sepia(1) hue-rotate(150deg) saturate(4)";
              ctx.drawImage(source, 0, sH * sy, sW, sH * s.h, rect.x + s.x + 15 * splitAmt, rect.y + rect.h * sy, rect.w, rect.h * s.h);
              
              ctx.globalCompositeOperation = "source-over";
              ctx.globalAlpha = 1;
              ctx.filter = "none";
            }
          }
        }
        ctx.restore();
      }
    }
    if (fx.type === "scanlines" && (p.amount ?? 0) > 0) {
      const amt = p.amount ?? 0.4;
      const density = p.density ?? 4;
      const spacing = Math.max(2, Math.round(density));
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = clamp(amt, 0, 1) * 0.4;
      ctx.fillStyle = "#000";
      for (let y = rect.y; y < rect.y + rect.h; y += spacing) {
        ctx.fillRect(rect.x, y, rect.w, spacing * 0.4);
      }
      ctx.restore();
    }
    if (fx.type === "cinema" && p.size > 0) {
      const barH = rect.h * clamp(p.size, 0, 0.4);
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(rect.x, rect.y, rect.w, barH);
      ctx.fillRect(rect.x, rect.y + rect.h - barH, rect.w, barH);
      ctx.restore();
    }
  }
}

/** High-pass unsharp mask — real sharpening built from two composited passes. */
function applySharpen(source: Drawable, w: number, h: number, amount: number, radius: number): HTMLCanvasElement {
  const base = scratchCanvas("a", w, h);
  const bctx = base.getContext("2d")!;
  bctx.clearRect(0, 0, w, h);
  bctx.filter = "none";
  bctx.drawImage(source, 0, 0, w, h);
  const hp = scratchCanvas("b", w, h);
  const hctx = hp.getContext("2d")!;
  hctx.clearRect(0, 0, w, h);
  hctx.filter = `blur(${Math.max(0.4, radius).toFixed(2)}px) invert(1)`;
  hctx.drawImage(source, 0, 0, w, h);
  hctx.filter = "none";
  bctx.save();
  bctx.globalCompositeOperation = "overlay";
  bctx.globalAlpha = clamp(amount, 0, 1);
  bctx.drawImage(hp, 0, 0);
  bctx.restore();
  return base;
}

/* ---------------------------- geometry ----------------------------- */

export function fitRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number; w: number; h: number } {
  if (!srcW || !srcH) return { x: 0, y: 0, w: dstW, h: dstH };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

export function sourceTimeFor(clip: VideoClip, time: number): number {
  const local = clamp(time - clip.start, 0, clip.duration);
  if (clip.freezeFrame) return clip.inPoint;
  const srcSpan = local * clip.speed;
  return clip.reverse ? Math.max(0, clip.outPoint - srcSpan) : clip.inPoint + srcSpan;
}

interface TransitionState {
  alpha: number;
  offsetX: number;
  offsetY: number;
  scale: number;
  dip: { color: string; alpha: number } | null;
}

function transitionState(clip: Clip, time: number): TransitionState {
  const state: TransitionState = { alpha: 1, offsetX: 0, offsetY: 0, scale: 1, dip: null };
  const apply = (t: Transition, progress: number, incoming: boolean) => {
    const p = clamp(progress, 0, 1);
    const dir = incoming ? 1 - p : p;
    switch (t.type) {
      case "dissolve":
      case "fade":
        state.alpha *= incoming ? p : 1 - p;
        break;
      case "dipToBlack":
        state.dip = { color: "#000000", alpha: incoming ? 1 - p : p };
        break;
      case "dipToWhite":
        state.dip = { color: "#ffffff", alpha: incoming ? 1 - p : p };
        break;
      case "slide":
        state.offsetX += (t.direction === "up" || t.direction === "down" ? 0 : 1) * dir * (t.direction === "right" ? -1 : 1);
        state.offsetY += (t.direction === "up" ? 1 : t.direction === "down" ? -1 : 0) * dir;
        break;
      case "push":
        state.offsetX += dir * (t.direction === "right" ? -1 : 1);
        state.alpha *= incoming ? Math.min(1, p * 1.6) : Math.max(0, 1 - p);
        break;
      case "zoom":
        state.scale *= incoming ? 1 + 0.35 * (1 - p) : 1 + 0.35 * p;
        state.alpha *= incoming ? p : 1 - p;
        break;
      case "cut":
      default:
        break;
    }
  };
  if (clip.transitionIn && clip.transitionIn.duration > 0) {
    const local = time - clip.start;
    if (local < clip.transitionIn.duration) apply(clip.transitionIn, local / clip.transitionIn.duration, true);
  }
  if (clip.transitionOut && clip.transitionOut.duration > 0) {
    const local = clipEnd(clip) - time;
    if (local < clip.transitionOut.duration)
      apply(clip.transitionOut, 1 - local / clip.transitionOut.duration, false);
  }
  return state;
}

function applyTransform(
  ctx: CanvasRenderingContext2D,
  tr: Transform,
  frameW: number,
  frameH: number,
  extra: TransitionState,
): void {
  const cx = frameW / 2 + (tr.x / 100) * frameW + extra.offsetX * frameW;
  const cy = frameH / 2 + (tr.y / 100) * frameH + extra.offsetY * frameH;
  ctx.translate(cx, cy);
  ctx.rotate((tr.rotation * Math.PI) / 180);
  ctx.scale(tr.scale * extra.scale, tr.scale * extra.scale);
  ctx.translate(-frameW / 2 - (tr.anchorX / 100) * frameW, -frameH / 2 - (tr.anchorY / 100) * frameH);
}

/* ------------------------------ text ------------------------------- */

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    if (ctx.measureText(raw).width <= maxWidth) {
      out.push(raw);
      continue;
    }
    let line = "";
    for (const word of raw.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = test;
    }
    if (line) out.push(line);
  }
  return out;
}

export function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextStyle,
  frameW: number,
  frameH: number,
  centerX: number,
  centerY: number,
  progress: number,
  animation: string,
): void {
  const scaleFactor = frameH / 1080;
  const fontSize = style.fontSize * scaleFactor;
  ctx.font = `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = style.align;
  const shown =
    animation === "typewriter" ? text.slice(0, Math.max(1, Math.ceil(text.length * clamp(progress * 1.4, 0, 1)))) : text;
  const lines = wrapLines(ctx, shown, frameW * 0.86);
  const lineH = fontSize * style.lineHeight;
  const totalH = lines.length * lineH;
  let alpha = style.opacity;
  let dy = 0;
  let scale = 1;
  if (animation === "fade") alpha *= clamp(progress * 4, 0, 1);
  if (animation === "slideUp") {
    alpha *= clamp(progress * 4, 0, 1);
    dy = (1 - clamp(progress * 4, 0, 1)) * fontSize * 1.2;
  }
  if (animation === "popIn") {
    const p = clamp(progress * 5, 0, 1);
    scale = 0.7 + 0.3 * p + Math.sin(p * Math.PI) * 0.06;
    alpha *= p;
  }
  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.translate(centerX, centerY + dy);
  ctx.scale(scale, scale);

  if ((style.hasBackground ?? (style.backgroundOpacity > 0)) && style.backgroundOpacity > 0) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width), 0);
    const padX = fontSize * 0.5;
    const padY = fontSize * 0.28;
    const bx = style.align === "left" ? 0 : style.align === "right" ? -widest : -widest / 2;
    ctx.save();
    ctx.globalAlpha = clamp(alpha * style.backgroundOpacity, 0, 1);
    ctx.fillStyle = style.background;
    const r = Math.min(16 * scaleFactor, fontSize * 0.4);
    const x = bx - padX;
    const y = -totalH / 2 - padY;
    const w = widest + padX * 2;
    const h = totalH + padY * 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.restore();
  }

  lines.forEach((line, i) => {
    const y = -totalH / 2 + lineH * (i + 0.5);
    if (style.shadow) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = style.shadowBlur * scaleFactor;
      ctx.shadowOffsetY = 2 * scaleFactor;
      ctx.fillStyle = style.color;
      ctx.fillText(line, 0, y);
      ctx.restore();
    }
    if ((style.hasStroke ?? (style.strokeWidth > 0)) && style.strokeWidth > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = style.strokeWidth * scaleFactor * 2;
      ctx.strokeStyle = style.strokeColor;
      ctx.strokeText(line, 0, y);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(line, 0, y);
  });
  ctx.restore();
}

/* ---------------------------- main entry --------------------------- */

function drawVideoClip(o: RenderOptions, clip: VideoClip): void {
  const { ctx, width, height } = o;
  const asset = o.assets.get(clip.assetId);
  if (!asset) return;
  let source: Drawable | null = null;
  let srcW = 0;
  let srcH = 0;
  if (asset.kind === "video") {
    const el = mediaPool.getVideo(clip.id, clip.assetId);
    if (!el || el.readyState < 2) return;
    source = el;
    srcW = el.videoWidth;
    srcH = el.videoHeight;
  } else if (asset.kind === "image") {
    const el = mediaPool.getImage(clip.assetId);
    if (!el || !el.complete || !el.naturalWidth) return;
    source = el;
    srcW = el.naturalWidth;
    srcH = el.naturalHeight;
  }
  if (!source || !srcW || !srcH) return;

  const trans = transitionState(clip, o.time);
  const localTime = o.time - clip.start;
  let alpha = clip.opacity * trans.alpha;
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) alpha *= localTime / clip.fadeIn;
  const tail = clipEnd(clip) - o.time;
  if (clip.fadeOut > 0 && tail < clip.fadeOut) alpha *= Math.max(0, tail / clip.fadeOut);
  if (alpha <= 0.002) return;

  // crop in source pixels
  const cropX = (clip.crop.left / 100) * srcW;
  const cropY = (clip.crop.top / 100) * srcH;
  const cropW = Math.max(1, srcW - cropX - (clip.crop.right / 100) * srcW);
  const cropH = Math.max(1, srcH - cropY - (clip.crop.bottom / 100) * srcH);

  const dst = fitRect(cropW, cropH, width, height);
  const sharpenFx = clip.effects.find((e) => e.enabled && e.type === "sharpen");

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.globalCompositeOperation = clip.blendMode === "normal" ? "source-over" : (clip.blendMode as GlobalCompositeOperation);
  applyTransform(ctx, clip.transform, width, height, trans);
  ctx.filter = gradeToFilter(clip.color, clip.effects);
  let painted: Drawable = source;
  if (sharpenFx && o.highQuality !== false) {
    const sw = Math.min(1280, Math.round(cropW));
    const sh = Math.max(1, Math.round((cropH / cropW) * sw));
    const tmp = scratchCanvas("a", sw, sh);
    const tctx = tmp.getContext("2d")!;
    tctx.clearRect(0, 0, sw, sh);
    tctx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, sw, sh);
    painted = applySharpen(tmp, sw, sh, sharpenFx.params.amount ?? 0.5, sharpenFx.params.radius ?? 1.2);
    ctx.drawImage(painted, 0, 0, sw, sh, dst.x, dst.y, dst.w, dst.h);
  } else {
    ctx.drawImage(source, cropX, cropY, cropW, cropH, dst.x, dst.y, dst.w, dst.h);
  }
  ctx.filter = "none";
  drawColorOverlays(ctx, dst, clip.color);
  drawPostEffects(ctx, dst, clip.effects, painted, o.time);
  ctx.restore();

  if (trans.dip && trans.dip.alpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = clamp(trans.dip.alpha, 0, 1);
    ctx.fillStyle = trans.dip.color;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

function drawTextClip(o: RenderOptions, clip: TextClip): void {
  const { ctx, width, height } = o;
  const trans = transitionState(clip, o.time);
  const progress = clamp((o.time - clip.start) / Math.max(0.001, clip.duration), 0, 1);
  ctx.save();
  ctx.globalAlpha = clamp(trans.alpha, 0, 1);
  ctx.filter = gradeToFilter(
    { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 },
    clip.effects,
  );
  const cx = width / 2 + (clip.transform.x / 100) * width + trans.offsetX * width;
  const cy = height / 2 + (clip.transform.y / 100) * height + trans.offsetY * height;
  ctx.translate(cx, cy);
  ctx.rotate((clip.transform.rotation * Math.PI) / 180);
  ctx.scale(clip.transform.scale * trans.scale, clip.transform.scale * trans.scale);
  drawTextBlock(ctx, clip.text, clip.style, width, height, 0, 0, progress, clip.animation);
  ctx.restore();
}

function drawSubtitleClip(o: RenderOptions, clip: SubtitleClip): void {
  const { ctx, width, height } = o;
  const y = height * clamp(clip.positionY, 0.02, 0.98);
  ctx.save();
  drawTextBlock(ctx, clip.text, clip.style, width, height, width / 2, y, 1, "none");
  ctx.restore();
}

export function renderFrame(o: RenderOptions): void {
  const { ctx, width, height, project, time } = o;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = project.settings.backgroundColor || "#000000";
  ctx.fillRect(0, 0, width, height);

  const videoTracks = project.tracks.filter((t) => t.kind === "video" && !t.hidden);
  for (let i = videoTracks.length - 1; i >= 0; i--) {
    const track = videoTracks[i];
    const trackOpacity = "opacity" in track ? track.opacity : 1;
    const clips = project.clips.filter(
      (c) => c.trackId === track.id && time >= c.start - 0.0001 && time < clipEnd(c),
    );
    for (const clip of clips) {
      ctx.save();
      ctx.globalAlpha = trackOpacity;
      if (isVideoClip(clip)) drawVideoClip({ ...o, ctx }, clip);
      else if (isTextClip(clip)) drawTextClip({ ...o, ctx }, clip);
      ctx.restore();
    }
  }

  if (o.showSubtitles !== false) {
    const subTracks = project.tracks.filter((t) => t.kind === "subtitle" && !t.hidden);
    for (const track of subTracks) {
      const clips = project.clips.filter(
        (c) => c.trackId === track.id && time >= c.start - 0.0001 && time < clipEnd(c),
      );
      for (const clip of clips) if (isSubtitleClip(clip)) drawSubtitleClip({ ...o, ctx }, clip);
    }
  }
  ctx.restore();
}
