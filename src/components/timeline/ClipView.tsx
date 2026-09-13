import { memo, useEffect, useRef } from "react";
import type { Clip, MediaAsset } from "@/types";
import { Icon } from "@/components/ui";
import { slicePeaks } from "@/services/audio/waveform";
import { formatTime } from "@/utils/format";
import { cn } from "@/utils/cn";

function Waveform({
  peaks,
  duration,
  from,
  to,
  width,
  height,
  color,
}: {
  peaks: number[] | undefined;
  duration: number;
  from: number;
  to: number;
  width: number;
  height: number;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!peaks || !peaks.length || duration <= 0) return;
    const bars = Math.max(1, Math.floor(w / 2));
    const data = slicePeaks(peaks, duration, from, to, bars);
    ctx.fillStyle = color;
    const mid = h / 2;
    for (let i = 0; i < bars; i++) {
      const amp = Math.max(0.02, data[i]) * (h / 2 - 1);
      ctx.fillRect(i * 2, mid - amp, 1.2, amp * 2);
    }
  }, [peaks, duration, from, to, width, height, color]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0" />;
}

export interface ClipViewProps {
  clip: Clip;
  asset?: MediaAsset;
  pps: number;
  height: number;
  selected: boolean;
  locked: boolean;
  onPointerDown: (e: React.PointerEvent, clipId: string, mode: "move" | "trim-start" | "trim-end") => void;
  onDoubleClick: (clipId: string) => void;
  onContextMenu: (e: React.MouseEvent, clipId: string) => void;
  onDropEffect: (clipId: string, effectType: string) => void;
  onDropTransition: (clipId: string, transitionType: string, side: "in" | "out") => void;
}

function ClipViewInner({
  clip,
  asset,
  pps,
  height,
  selected,
  locked,
  onPointerDown,
  onDoubleClick,
  onContextMenu,
  onDropEffect,
  onDropTransition,
}: ClipViewProps) {
  const width = Math.max(6, clip.duration * pps);
  const kindColor =
    clip.type === "audio"
      ? "var(--md-track-audio)"
      : clip.type === "text"
        ? "var(--md-track-text)"
        : clip.type === "subtitle"
          ? "var(--md-track-subtitle)"
          : clip.type === "shape"
            ? "var(--md-track-text)"
          : "var(--md-track-video)";

  const thumb = asset && "thumbnail" in asset ? asset.thumbnail : undefined;
  const peaks = asset && "peaks" in asset ? asset.peaks : undefined;
  const assetDuration = asset && "duration" in asset ? asset.duration : 0;
  const showWave = (clip.type === "audio" || (clip.type === "video" && !!peaks)) && width > 26;
  const inPoint = "inPoint" in clip ? clip.inPoint : 0;
  const outPoint = "outPoint" in clip ? clip.outPoint : 0;
  const effects = "effects" in clip ? clip.effects.length : 0;
  const speed = "speed" in clip ? clip.speed : 1;
  const muted = "muted" in clip ? clip.muted : false;
  const reverse = "reverse" in clip ? clip.reverse : false;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${clip.label}, ${formatTime(clip.duration, false)}`}
      aria-pressed={selected}
      onPointerDown={(e) => !locked && onPointerDown(e, clip.id, "move")}
      onDoubleClick={() => onDoubleClick(clip.id)}
      onContextMenu={(e) => onContextMenu(e, clip.id)}
      onDragOver={(e) => {
        if (
          e.dataTransfer.types.includes("application/x-mvs-effect") ||
          e.dataTransfer.types.includes("application/x-mvs-transition")
        ) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const fx = e.dataTransfer.getData("application/x-mvs-effect");
        if (fx) {
          e.preventDefault();
          e.stopPropagation();
          onDropEffect(clip.id, fx);
          return;
        }
        const tr = e.dataTransfer.getData("application/x-mvs-transition");
        if (tr) {
          e.preventDefault();
          e.stopPropagation();
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          onDropTransition(clip.id, tr, e.clientX - rect.left < rect.width / 2 ? "in" : "out");
        }
      }}
      className={cn(
        "group absolute top-1 select-none overflow-hidden rounded-[8px] text-left shadow-sm transition-[box-shadow,outline] duration-100",
        locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
        selected ? "outline outline-2 outline-offset-[-2px] outline-on-surface" : "outline outline-1 outline-black/15",
      )}
      style={{
        left: clip.start * pps,
        width,
        height: height - 8,
        background: `color-mix(in srgb, ${kindColor} 78%, black)`,
      }}
    >
      {thumb && clip.type === "video" && (
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: `url(${thumb})`,
            backgroundSize: "auto 100%",
            backgroundRepeat: "repeat-x",
          }}
        />
      )}
      {showWave && (
        <div className="absolute inset-x-0 bottom-0" style={{ height: clip.type === "audio" ? height - 8 : (height - 8) * 0.45 }}>
          <Waveform
            peaks={peaks}
            duration={assetDuration}
            from={inPoint}
            to={outPoint || inPoint + clip.duration}
            width={width}
            height={clip.type === "audio" ? height - 8 : (height - 8) * 0.45}
            color="rgba(255,255,255,0.55)"
          />
        </div>
      )}

      {clip.transitionIn && clip.transitionIn.type !== "cut" && (
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-white/45 to-transparent"
          style={{ width: Math.min(width * 0.5, clip.transitionIn.duration * pps) }}
        />
      )}
      {clip.transitionOut && clip.transitionOut.type !== "cut" && (
        <div
          className="absolute right-0 top-0 h-full bg-gradient-to-l from-white/45 to-transparent"
          style={{ width: Math.min(width * 0.5, clip.transitionOut.duration * pps) }}
        />
      )}

      <div className="relative flex items-center gap-1 px-1.5 pt-1">
        <Icon
          name={
            clip.type === "audio"
              ? "graphic_eq"
              : clip.type === "text"
                ? "title"
                : clip.type === "subtitle"
                  ? "subtitles"
                  : clip.type === "shape"
                    ? "shapes"
                  : "movie"
          }
          size={12}
          className="shrink-0 text-white/85"
        />
        <span className="truncate text-[10px] font-medium leading-tight text-white/95">
          {clip.type === "text" || clip.type === "subtitle" ? clip.text.replace(/\n/g, " ") : clip.label}
        </span>
      </div>
      {width > 90 && (
        <div className="relative flex items-center gap-1 px-1.5 pt-0.5">
          <span className="font-mono text-[9px] text-white/70">{formatTime(clip.duration, false)}</span>
          {speed !== 1 && <span className="rounded-[3px] bg-black/40 px-1 text-[9px] text-white/85">{speed}×</span>}
          {reverse && <Icon name="fast_rewind" size={10} className="text-white/85" />}
          {muted && <Icon name="volume_off" size={10} className="text-white/85" />}
          {effects > 0 && (
            <span className="flex items-center gap-0.5 rounded-[3px] bg-black/40 px-1 text-[9px] text-white/85">
              <Icon name="auto_fix_high" size={9} />
              {effects}
            </span>
          )}
        </div>
      )}

      {!locked && (
        <>
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, clip.id, "trim-start");
            }}
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition-colors hover:bg-white/35"
            aria-hidden
          />
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, clip.id, "trim-end");
            }}
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition-colors hover:bg-white/35"
            aria-hidden
          />
        </>
      )}
    </div>
  );
}

export const ClipView = memo(ClipViewInner);
