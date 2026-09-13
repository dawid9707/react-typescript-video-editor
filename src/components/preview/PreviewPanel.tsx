import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, IconButton, SegmentedButtons, Tooltip } from "@/components/ui";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { playbackEngine } from "@/services/playback/engine";
import { usePlaybackPlaying, usePlayheadRef } from "@/hooks/usePlayback";
import { isBlurClip, isTextClip, projectDuration } from "@/features/timeline/selectors";
import { formatTimecode } from "@/utils/format";
import { cn } from "@/utils/cn";

const RATES = [0.25, 0.5, 1, 1.5, 2];
const PREVIEW_MAX_WIDTH = 1280;

export function PreviewPanel() {
  const settings = useProjectStore((s) => s.project.settings);
  const duration = useProjectStore((s) => projectDuration(s.project));
  const hasClips = useProjectStore((s) => s.project.clips.length > 0);
  const clips = useProjectStore((s) => s.project.clips);
  const updateClip = useProjectStore((s) => s.updateClip);
  const selectedIds = useUiStore((s) => s.selectedClipIds);
  const notify = useUiStore((s) => s.notify);
  const playing = usePlaybackPlaying();
  const selectedClip = selectedIds.length === 1 ? clips.find((clip) => clip.id === selectedIds[0]) : undefined;
  const selectedBlur = selectedClip && isBlurClip(selectedClip) ? selectedClip : undefined;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const scrubRef = useRef<HTMLDivElement>(null);

  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [zoom, setZoom] = useState<"fit" | 0.5 | 1 | 2>("fit");
  const [showSafe, setShowSafe] = useState(false);

  // Register the canvas as a render target of the playback engine.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, PREVIEW_MAX_WIDTH / settings.width);
    const w = Math.max(2, Math.round(settings.width * scale));
    const h = Math.max(2, Math.round(settings.height * scale));
    canvas.width = w;
    canvas.height = h;
    playbackEngine.addTarget({ id: "preview", canvas, width: w, height: h, highQuality: true });
    playbackEngine.paint();
    return () => playbackEngine.removeTarget("preview");
  }, [settings.width, settings.height]);

  // Playhead → DOM updates without re-rendering React.
  usePlayheadRef((time) => {
    const total = playbackEngine.duration();
    if (timeRef.current) timeRef.current.textContent = formatTimecode(time, settings.fps);
    const ratio = total > 0 ? Math.min(1, time / total) : 0;
    if (fillRef.current) fillRef.current.style.width = `${ratio * 100}%`;
    if (knobRef.current) knobRef.current.style.left = `${ratio * 100}%`;
  });

  const scrubTo = useCallback(
    (clientX: number) => {
      const el = scrubRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      playbackEngine.seek(ratio * playbackEngine.duration());
    },
    [],
  );

  const onScrubPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    scrubTo(e.clientX);
    const move = (ev: PointerEvent) => scrubTo(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const step = (frames: number) => {
    playbackEngine.pause();
    playbackEngine.seek(Math.max(0, playbackEngine.time + frames / settings.fps));
  };

  const toggleFs = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen().catch(() => notify({ text: "Tryb pełnoekranowy jest niedostępny.", tone: "error" }));
  };

  const canvasStyle =
    zoom === "fit"
      ? { maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto" }
      : { width: `${settings.width * (zoom as number) * 0.5}px`, height: "auto", maxWidth: "none", maxHeight: "none" };

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (selectedIds.length !== 1) return;
      const clip = clips.find((c) => c.id === selectedIds[0]);
      if (!clip || !isTextClip(clip)) return;

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startTransformX = clip.transform.x;
      const startTransformY = clip.transform.y;

      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        const newX = startTransformX + (dx / rect.width) * 100;
        const newY = startTransformY + (dy / rect.height) * 100;

        updateClip(clip.id, { transform: { ...clip.transform, x: newX, y: newY } });
        playbackEngine.invalidate();
      };

      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [selectedIds, clips, updateClip]
  );

  const onBlurPointerDown = (e: React.PointerEvent<HTMLElement>, resize: boolean) => {
    const clip = selectedBlur;
    const canvas = canvasRef.current;
    if (!clip || !canvas) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      const next = resize
        ? {
            x: start.x,
            y: start.y,
            width: Math.max(4, Math.min(100 - start.x, start.width + dx)),
            height: Math.max(4, Math.min(100 - start.y, start.height + dy)),
          }
        : {
            x: Math.max(0, Math.min(100 - start.width, start.x + dx)),
            y: Math.max(0, Math.min(100 - start.height, start.y + dy)),
            width: start.width,
            height: start.height,
          };
      updateClip(clip.id, next);
      playbackEngine.invalidate();
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section aria-label="Podgląd" className="flex h-full min-h-0 flex-col bg-surf-low">
      <div ref={wrapRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/90 p-3">
        <div className="relative grid place-items-center">
          <canvas
            ref={canvasRef}
            style={canvasStyle}
            className="rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.45)] cursor-move"
            aria-label="Podgląd projektu"
            onPointerDown={onCanvasPointerDown}
          />
          {selectedBlur && (
            <div
              className="pointer-events-auto absolute border-2 border-dashed border-cyan-300 bg-cyan-300/10 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]"
              style={{
                left: `${selectedBlur.x}%`,
                top: `${selectedBlur.y}%`,
                width: `${selectedBlur.width}%`,
                height: `${selectedBlur.height}%`,
                borderRadius: selectedBlur.shape === "ellipse" ? "50%" : "8px",
                cursor: "move",
              }}
              onPointerDown={(e) => onBlurPointerDown(e, false)}
            >
              <span
                aria-label="Zmień rozmiar obszaru blur"
                className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-cyan-200 bg-cyan-500 shadow"
                onPointerDown={(e) => onBlurPointerDown(e, true)}
              />
            </div>
          )}
          {showSafe && (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-[5%] border border-white/35" />
              <div className="absolute inset-[10%] border border-white/25" />
            </div>
          )}
          {!hasClips && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-2 rounded-[16px] bg-black/55 px-6 py-5 text-center">
                <Icon name="movie" size={30} className="text-white/70" />
                <p className="text-[13px] font-medium text-white/90">Podgląd jest pusty</p>
                <p className="max-w-[260px] text-[11px] text-white/60">
                  Zaimportuj materiały i przeciągnij je na oś czasu, aby zobaczyć podgląd na żywo.
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="absolute right-3 top-3 flex gap-1 rounded-full bg-black/45 p-1 backdrop-blur-[2px]">
          <IconButton
            icon="crop_free"
            label="Marginesy bezpieczne"
            size={32}
            selected={showSafe}
            className="text-white"
            onClick={() => setShowSafe((v) => !v)}
          />
          <IconButton icon="fullscreen" label="Pełny ekran podglądu" size={32} className="text-white" onClick={toggleFs} />
        </div>
        <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] text-white/80">
          {settings.width}×{settings.height} · {settings.fps} fps
        </span>
      </div>

      <div className="shrink-0 px-3 pb-2 pt-2">
        <div
          ref={scrubRef}
          role="slider"
          tabIndex={0}
          aria-label="Pozycja odtwarzania"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(playbackEngine.time)}
          onPointerDown={onScrubPointerDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") step(-1);
            if (e.key === "ArrowRight") step(1);
          }}
          className="group relative h-5 cursor-pointer"
        >
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-surface-variant">
            <div ref={fillRef} className="h-full rounded-full bg-primary" style={{ width: "0%" }} />
          </div>
          <div
            ref={knobRef}
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow transition-transform group-hover:scale-125"
            style={{ left: "0%" }}
          />
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <IconButton icon="first_page" label="Początek" onClick={() => playbackEngine.seek(0)} size={36} />
          <IconButton icon="skip_previous" label="Poprzednia klatka" onClick={() => step(-1)} size={36} />
          <IconButton
            icon={playing ? "pause" : "play_arrow"}
            label={playing ? "Pauza (Spacja)" : "Odtwórz (Spacja)"}
            variant="filled"
            selected
            filled
            size={44}
            onClick={() => playbackEngine.toggle()}
          />
          <IconButton icon="skip_next" label="Następna klatka" onClick={() => step(1)} size={36} />
          <IconButton icon="last_page" label="Koniec" onClick={() => playbackEngine.seek(duration)} size={36} />

          <div className="ml-1 flex items-baseline gap-1 rounded-[10px] bg-surf px-2.5 py-1">
            <span ref={timeRef} className="font-mono text-[13px] font-medium text-on-surface">
              {formatTimecode(0, settings.fps)}
            </span>
            <span className="font-mono text-[11px] text-on-surface-variant">/ {formatTimecode(duration, settings.fps)}</span>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-1">
            <IconButton
              icon={muted || volume === 0 ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"}
              label={muted ? "Wyłącz wyciszenie" : "Wycisz"}
              size={36}
              onClick={() => {
                const next = !muted;
                setMuted(next);
                playbackEngine.muted = next;
              }}
            />
            <input
              type="range"
              className="md-slider w-20"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              aria-label="Głośność podglądu"
              style={{ ["--val" as string]: String(volume) }}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                playbackEngine.volume = v;
              }}
            />
          </div>

          <SegmentedButtons
            dense
            className="hidden sm:inline-flex"
            value={String(rate)}
            onChange={(v) => {
              const r = Number(v);
              setRate(r);
              playbackEngine.setRate(r);
            }}
            options={RATES.map((r) => ({ value: String(r), label: `${r}×` }))}
          />

          <Tooltip label="Powiększenie podglądu">
            <select
              value={String(zoom)}
              onChange={(e) => setZoom(e.target.value === "fit" ? "fit" : (Number(e.target.value) as 0.5 | 1 | 2))}
              aria-label="Powiększenie podglądu"
              className={cn(
                "h-8 rounded-full bg-surf px-2 text-[12px] text-on-surface-variant outline-none",
                "focus:ring-2 focus:ring-primary",
              )}
            >
              <option value="fit">Dopasuj</option>
              <option value="0.5">50%</option>
              <option value="1">100%</option>
              <option value="2">200%</option>
            </select>
          </Tooltip>
        </div>
      </div>
    </section>
  );
}
