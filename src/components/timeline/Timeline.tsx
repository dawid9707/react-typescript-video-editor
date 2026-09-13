import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioTrack, Clip, EffectType, Track, TransitionType } from "@/types";
import { Icon, IconButton, Menu, Switch, Tooltip } from "@/components/ui";
import { ClipView } from "@/components/timeline/ClipView";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { usePlayheadRef } from "@/hooks/usePlayback";
import { playbackEngine } from "@/services/playback/engine";
import { clipEnd, projectDuration, snapTime } from "@/features/timeline/selectors";
import { createEffect } from "@/features/project/factory";
import { formatTime, uid } from "@/utils/format";
import { cn } from "@/utils/cn";

const HEADER_WIDTH = 156;
const RULER_HEIGHT = 34;

interface DragState {
  mode: "move" | "trim-start" | "trim-end";
  clipId: string;
  startX: number;
  startY: number;
  origStart: number;
  origEnd: number;
  origTrackId: string;
}

function rulerStep(pps: number): { major: number; minor: number } {
  const targets = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const major = targets.find((t) => t * pps > 90) ?? 900;
  return { major, minor: major / 5 };
}

function TrackHeader({
  track,
  index,
  onDragStart,
  onDragEnd,
}: {
  track: Track;
  index: number;
  onDragStart: (e: React.DragEvent, trackId: string) => void;
  onDragEnd: () => void;
}) {
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const removeTrack = useProjectStore((s) => s.removeTrack);
  const moveTrack = useProjectStore((s) => s.moveTrack);
  const audio = track.kind === "audio" ? (track as AudioTrack) : null;

  return (
    <div
      className="sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1 border-b border-r border-outline-variant bg-surf px-2 py-1"
      style={{ width: HEADER_WIDTH, height: track.height }}
      draggable
      onDragStart={(e) => onDragStart(e, track.id)}
      onDragEnd={onDragEnd}
      title="Przeciągnij, aby zmienić kolejność ścieżki"
    >
      <div className="flex items-center gap-1">
        <Icon
          name={track.kind === "video" ? "movie" : track.kind === "audio" ? "graphic_eq" : "subtitles"}
          size={14}
          className="text-on-surface-variant"
        />
        <input
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          aria-label={`Nazwa ścieżki ${track.name}`}
          className="w-10 shrink-0 bg-transparent text-[11px] font-semibold text-on-surface outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex flex-1 justify-end gap-0.5">
          {audio ? (
            <>
              <button
                aria-label="Wycisz ścieżkę"
                title="Mute"
                onClick={() => updateTrack(track.id, { muted: !audio.muted })}
                className={cn(
                  "state-layer grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
                  audio.muted ? "bg-error-container text-on-error-container" : "text-on-surface-variant",
                )}
              >
                M
              </button>
              <button
                aria-label="Solo ścieżki"
                title="Solo"
                onClick={() => updateTrack(track.id, { solo: !audio.solo })}
                className={cn(
                  "state-layer grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold",
                  audio.solo ? "bg-tertiary-container text-on-tertiary-container" : "text-on-surface-variant",
                )}
              >
                S
              </button>
            </>
          ) : (
            <IconButton
              icon={track.hidden ? "visibility_off" : "visibility"}
              label={track.hidden ? "Pokaż ścieżkę" : "Ukryj ścieżkę"}
              size={24}
              onClick={() => updateTrack(track.id, { hidden: !track.hidden })}
            />
          )}
          <IconButton
            icon={track.locked ? "lock" : "lock_open"}
            label={track.locked ? "Odblokuj ścieżkę" : "Zablokuj ścieżkę"}
            size={24}
            selected={track.locked}
            onClick={() => updateTrack(track.id, { locked: !track.locked })}
          />
          <Menu
            align="left"
            items={[
              { id: "up", label: "Przenieś wyżej", icon: "arrow_upward", disabled: index === 0, onSelect: () => moveTrack(track.id, -1) },
              { id: "down", label: "Przenieś niżej", icon: "arrow_downward", onSelect: () => moveTrack(track.id, 1) },
              { id: "d", label: "", divider: true },
              { id: "del", label: "Usuń ścieżkę", icon: "delete", danger: true, onSelect: () => removeTrack(track.id) },
            ]}
            trigger={({ onClick, ref }) => (
              <button
                ref={ref}
                onClick={onClick}
                aria-label="Opcje ścieżki"
                className="state-layer grid h-6 w-6 place-items-center rounded-full text-on-surface-variant"
              >
                <Icon name="more_vert" size={14} />
              </button>
            )}
          />
        </div>
      </div>
      {audio && (
        <input
          type="range"
          className="md-slider h-3"
          min={0}
          max={1.5}
          step={0.01}
          value={audio.volume}
          aria-label={`Głośność ${track.name}`}
          style={{ ["--val" as string]: String(audio.volume / 1.5) }}
          onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
        />
      )}
    </div>
  );
}

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const moveClip = useProjectStore((s) => s.moveClip);
  const trimClip = useProjectStore((s) => s.trimClip);
  const splitClips = useProjectStore((s) => s.splitClips);
  const deleteClips = useProjectStore((s) => s.deleteClips);
  const duplicateClips = useProjectStore((s) => s.duplicateClips);
  const copyClips = useProjectStore((s) => s.copyClips);
  const pasteClips = useProjectStore((s) => s.pasteClips);
  const detachAudio = useProjectStore((s) => s.detachAudio);
  const updateClip = useProjectStore((s) => s.updateClip);
  const addEffect = useProjectStore((s) => s.addEffect);
  const setTransition = useProjectStore((s) => s.setTransition);
  const addAssetToTimeline = useProjectStore((s) => s.addAssetToTimeline);
  const addTrack = useProjectStore((s) => s.addTrack);
  const addMarker = useProjectStore((s) => s.addMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const reorderTrack = useProjectStore((s) => s.reorderTrack);

  const pps = useUiStore((s) => s.pixelsPerSecond);
  const setPps = useUiStore((s) => s.setPixelsPerSecond);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const select = useUiStore((s) => s.select);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const notify = useUiStore((s) => s.notify);
  const setActiveMarker = useUiStore((s) => s.setActiveMarker);
  const openDialog = useUiStore((s) => s.openDialog);
  const snapping = useSettingsStore((s) => s.snapping);
  const setSetting = useSettingsStore((s) => s.set);

  const scrollRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dropTrackId, setDropTrackId] = useState<string | null>(null);

  const duration = projectDuration(project);
  const contentWidth = Math.max(duration + 12, 40) * pps + HEADER_WIDTH;
  const assetMap = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);
  const clipsByTrack = useMemo(() => {
    const grouped = new Map<string, Clip[]>();
    for (const clip of project.clips) {
      const clips = grouped.get(clip.trackId);
      if (clips) clips.push(clip);
      else grouped.set(clip.trackId, [clip]);
    }
    return grouped;
  }, [project.clips]);

  usePlayheadRef((time, playing) => {
    const el = playheadRef.current;
    if (el) el.style.transform = `translate3d(${HEADER_WIDTH + time * pps}px,0,0)`;
    const scroller = scrollRef.current;
    if (scroller && playing) {
      const x = HEADER_WIDTH + time * pps;
      const left = scroller.scrollLeft;
      const right = left + scroller.clientWidth;
      if (x > right - 120 || x < left + HEADER_WIDTH) {
        scroller.scrollLeft = Math.max(0, x - scroller.clientWidth * 0.6);
      }
    }
  });

  useEffect(() => {
    const el = playheadRef.current;
    if (el) el.style.transform = `translate3d(${HEADER_WIDTH + playbackEngine.time * pps}px,0,0)`;
  }, [pps]);

  const timeFromClientX = useCallback(
    (clientX: number): number => {
      const scroller = scrollRef.current;
      if (!scroller) return 0;
      const rect = scroller.getBoundingClientRect();
      const x = clientX - rect.left + scroller.scrollLeft - HEADER_WIDTH;
      return Math.max(0, x / pps);
    },
    [pps],
  );

  const seekFromEvent = useCallback(
    (clientX: number) => playbackEngine.seek(timeFromClientX(clientX)),
    [timeFromClientX],
  );

  const onRulerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    seekFromEvent(e.clientX);
    const move = (ev: PointerEvent) => seekFromEvent(ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onClipPointerDown = useCallback(
    (e: React.PointerEvent, clipId: string, mode: DragState["mode"]) => {
      const clip = useProjectStore.getState().project.clips.find((c) => c.id === clipId);
      if (!clip) return;
      if (tool === "razor") {
        const t = timeFromClientX(e.clientX);
        const created = splitClips([clipId], t);
        if (created.length) notify("Klip podzielony.");
        return;
      }
      e.preventDefault();
      if (!selectedClipIds.includes(clipId)) select([clipId], e.shiftKey);
      else if (e.shiftKey) select([clipId], true);
      dragRef.current = {
        mode,
        clipId,
        startX: e.clientX,
        startY: e.clientY,
        origStart: clip.start,
        origEnd: clipEnd(clip),
        origTrackId: clip.trackId,
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const dt = (ev.clientX - drag.startX) / pps;
        const state = useProjectStore.getState();
        const tolerance = 8 / pps;
        if (drag.mode === "move") {
          let next = Math.max(0, drag.origStart + dt);
          if (snapping) {
            const snapStart = snapTime(state.project, next, tolerance, [drag.clipId], playbackEngine.time);
            const snapEnd = snapTime(
              state.project,
              next + (drag.origEnd - drag.origStart),
              tolerance,
              [drag.clipId],
              playbackEngine.time,
            );
            if (snapStart.snapped) {
              next = snapStart.time;
              setGuide(snapStart.guide);
            } else if (snapEnd.snapped) {
              next = snapEnd.time - (drag.origEnd - drag.origStart);
              setGuide(snapEnd.guide);
            } else setGuide(null);
          }
          const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
          const row = target?.closest("[data-track-id]") as HTMLElement | null;
          const clip = state.project.clips.find((c) => c.id === drag.clipId);
          const wantKind = clip?.type === "audio" ? "audio" : clip?.type === "subtitle" ? "subtitle" : "video";
          const targetTrack = row?.dataset.trackId
            ? state.project.tracks.find((t) => t.id === row.dataset.trackId && t.kind === wantKind && !t.locked)
            : undefined;
          moveClip(drag.clipId, next, targetTrack?.id);
        } else if (drag.mode === "trim-start") {
          let t = drag.origStart + dt;
          if (snapping) {
            const s = snapTime(state.project, t, tolerance, [drag.clipId], playbackEngine.time);
            t = s.time;
            setGuide(s.snapped ? s.guide : null);
          }
          trimClip(drag.clipId, "start", Math.max(0, t));
        } else {
          let t = drag.origEnd + dt;
          if (snapping) {
            const s = snapTime(state.project, t, tolerance, [drag.clipId], playbackEngine.time);
            t = s.time;
            setGuide(s.snapped ? s.guide : null);
          }
          trimClip(drag.clipId, "end", Math.max(0.1, t));
        }
      };
      const onUp = () => {
        dragRef.current = null;
        setGuide(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [moveClip, notify, pps, select, selectedClipIds, snapping, splitClips, timeFromClientX, tool, trimClip],
  );

  const onDropOnTrack = (e: React.DragEvent, trackId: string) => {
    const assetId = e.dataTransfer.getData("application/x-mvs-asset");
    if (!assetId) return;
    e.preventDefault();
    const time = timeFromClientX(e.clientX);
    const id = addAssetToTimeline(assetId, trackId, time);
    if (id) select([id]);
    else notify({ text: "Nie można umieścić tego materiału na wybranej ścieżce.", tone: "error" });
  };

  const onTrackDragStart = useCallback((e: React.DragEvent, trackId: string) => {
    e.dataTransfer.setData("application/x-mvs-track", trackId);
    e.dataTransfer.effectAllowed = "move";
    setDraggedTrackId(trackId);
  }, []);

  const onTrackDragEnd = useCallback(() => {
    setDraggedTrackId(null);
    setDropTrackId(null);
  }, []);

  const onTrackDrop = useCallback(
    (e: React.DragEvent, targetTrackId: string) => {
      const trackId = e.dataTransfer.getData("application/x-mvs-track");
      if (!trackId || trackId === targetTrackId) return;
      e.preventDefault();
      e.stopPropagation();
      reorderTrack(trackId, targetTrackId);
      onTrackDragEnd();
    },
    [onTrackDragEnd, reorderTrack],
  );

  const onClipDoubleClick = useCallback(
    (id: string) => {
      select([id]);
      useUiStore.getState().togglePanel("right", true);
    },
    [select],
  );

  const onClipContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      select([id]);
      setMenu({ x: e.clientX, y: e.clientY, clipId: id });
    },
    [select],
  );

  const onDropEffect = useCallback(
    (id: string, type: string) => {
      addEffect(id, createEffect(type as EffectType));
      notify("Dodano efekt do klipu.");
    },
    [addEffect, notify],
  );

  const onDropTransition = useCallback(
    (id: string, type: string, side: "in" | "out") => {
      setTransition(
        id,
        side,
        type === "cut" ? undefined : { id: uid("tr"), type: type as TransitionType, duration: 0.8 },
      );
      notify(`Przejście ${side === "in" ? "wejściowe" : "wyjściowe"} dodane.`);
    },
    [notify, setTransition],
  );

  const selection = selectedClipIds;
  const hasSelection = selection.length > 0;
  const selectedClip: Clip | undefined = project.clips.find((c) => c.id === selection[0]);

  const zoomBy = (factor: number) => setPps(Math.round(pps * factor));
  const fitTimeline = () => {
    const scroller = scrollRef.current;
    if (!scroller || duration <= 0) return;
    setPps(Math.max(6, (scroller.clientWidth - HEADER_WIDTH - 32) / duration));
  };

  return (
    <section aria-label="Oś czasu" className="flex min-h-0 flex-1 flex-col bg-surf-low">
      {/* toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-outline-variant px-2 py-1.5">
        <div className="flex items-center gap-0.5 rounded-full bg-surf p-0.5">
          <IconButton icon="arrow_selector_tool" label="Narzędzie zaznaczania (V)" size={32} selected={tool === "select"} onClick={() => setTool("select")} />
          <IconButton icon="content_cut" label="Żyletka (C)" size={32} selected={tool === "razor"} onClick={() => setTool("razor")} />
        </div>
        <div className="mx-1 h-6 w-px bg-outline-variant" />
        <IconButton
          icon="content_cut"
          label="Podziel w playheadzie (S)"
          size={32}
          onClick={() => {
            const targets = hasSelection
              ? selection
              : project.clips.filter((c) => playbackEngine.time > c.start && playbackEngine.time < clipEnd(c)).map((c) => c.id);
            const created = splitClips(targets, playbackEngine.time);
            notify(created.length ? `Podzielono ${created.length} klip(y).` : "Brak klipu pod playheadem.");
          }}
        />
        <IconButton icon="content_copy" label="Kopiuj (Ctrl+C)" size={32} disabled={!hasSelection} onClick={() => copyClips(selection)} />
        <IconButton icon="content_paste" label="Wklej (Ctrl+V)" size={32} onClick={() => select(pasteClips(playbackEngine.time))} />
        <IconButton icon="library_add" label="Duplikuj (Ctrl+D)" size={32} disabled={!hasSelection} onClick={() => select(duplicateClips(selection))} />
        <IconButton
          icon="call_split"
          label="Odłącz audio"
          size={32}
          disabled={!selectedClip || selectedClip.type !== "video"}
          onClick={() => {
            selection.forEach(detachAudio);
            notify("Audio odłączone na ścieżkę A1.");
          }}
        />
        <IconButton
          icon="fast_rewind"
          label="Odwróć klip"
          size={32}
          disabled={!selectedClip || (selectedClip.type !== "video" && selectedClip.type !== "audio")}
          onClick={() => {
            for (const id of selection) {
              const c = project.clips.find((x) => x.id === id);
              if (c && (c.type === "video" || c.type === "audio")) updateClip(id, { reverse: !c.reverse } as Partial<Clip>);
            }
          }}
        />
        <IconButton icon="delete" label="Usuń (Delete)" size={32} disabled={!hasSelection} onClick={() => { deleteClips(selection); clearSelection(); }} />
        <div className="mx-1 h-6 w-px bg-outline-variant" />
        <IconButton icon="bookmark_add" label="Dodaj marker (M)" size={32} onClick={() => { addMarker(playbackEngine.time); notify("Dodano marker."); }} />
        <Menu
          align="left"
          items={[
            { id: "v", label: "Dodaj ścieżkę wideo", icon: "movie", onSelect: () => addTrack("video") },
            { id: "a", label: "Dodaj ścieżkę audio", icon: "graphic_eq", onSelect: () => addTrack("audio") },
            { id: "s", label: "Dodaj ścieżkę napisów", icon: "subtitles", onSelect: () => addTrack("subtitle") },
          ]}
          trigger={({ onClick, ref }) => (
            <Tooltip label="Dodaj ścieżkę">
              <button ref={ref} onClick={onClick} aria-label="Dodaj ścieżkę" className="state-layer grid h-8 w-8 place-items-center rounded-full text-on-surface-variant">
                <Icon name="playlist_add" size={18} />
              </button>
            </Tooltip>
          )}
        />

        <div className="flex-1" />

        <label className="flex items-center gap-1.5 pr-1 text-[11px] text-on-surface-variant">
          <span className="hidden sm:inline">Przyciąganie</span>
          <Switch checked={snapping} onChange={(v) => setSetting("snapping", v)} label="Przyciąganie" />
        </label>
        <IconButton icon="zoom_out" label="Oddal" size={32} onClick={() => zoomBy(1 / 1.3)} />
        <input
          type="range"
          className="md-slider w-24"
          min={6}
          max={400}
          step={1}
          value={pps}
          aria-label="Powiększenie osi czasu"
          style={{ ["--val" as string]: String((pps - 6) / 394) }}
          onChange={(e) => setPps(Number(e.target.value))}
        />
        <IconButton icon="zoom_in" label="Przybliż" size={32} onClick={() => zoomBy(1.3)} />
        <IconButton icon="fit_screen" label="Dopasuj do okna" size={32} onClick={fitTimeline} />
      </div>

      {/* timeline body */}
      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-clip]")) return;
          if (e.target === e.currentTarget) clearSelection();
        }}
      >
        <div className="relative" style={{ width: contentWidth, minHeight: "100%" }}>
          {/* ruler */}
          <div
            className="sticky top-0 z-30 flex bg-surf"
            style={{ height: RULER_HEIGHT }}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest("[data-marker]")) return;
              onRulerPointerDown(e);
            }}
          >
            <div
              className="sticky left-0 z-10 flex items-center justify-center gap-1 border-b border-r border-outline-variant bg-surf text-[10px] font-semibold uppercase tracking-wide text-on-surface-variant"
              style={{ width: HEADER_WIDTH }}
            >
              <Icon name="schedule" size={13} />
              Timeline
            </div>
            <div className="relative flex-1 border-b border-outline-variant">
              <RulerTicks pps={pps} width={contentWidth - HEADER_WIDTH} />
              {project.markers.map((m) => (
                <button
                  key={m.id}
                  data-marker
                  title={`${m.name} · ${formatTime(m.time, false)}`}
                  onClick={() => {
                    setActiveMarker(m.id);
                    openDialog("marker");
                  }}
                  onDoubleClick={() => removeMarker(m.id)}
                  className="absolute bottom-0 z-10 h-3 w-3 -translate-x-1/2 rounded-t-[3px]"
                  style={{ left: m.time * pps, background: m.color }}
                  aria-label={`Marker ${m.name}`}
                />
              ))}
            </div>
          </div>

          {/* tracks */}
          <div className="relative">
            {project.tracks.map((track, index) => (
              <div
                key={track.id}
                className={cn("flex transition-colors", dropTrackId === track.id && draggedTrackId !== track.id && "bg-primary/15")}
                style={{ height: track.height }}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes("application/x-mvs-track")) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropTrackId(track.id);
                  }
                }}
                onDragLeave={() => setDropTrackId((id) => (id === track.id ? null : id))}
                onDrop={(e) => onTrackDrop(e, track.id)}
              >
                <TrackHeader track={track} index={index} onDragStart={onTrackDragStart} onDragEnd={onTrackDragEnd} />
                <div
                  data-track-id={track.id}
                  className={cn(
                    "relative flex-1 border-b border-outline-variant",
                    track.kind === "video" ? "bg-surf-low" : track.kind === "audio" ? "bg-surf-lowest" : "bg-surf-low",
                    track.locked && "opacity-60",
                  )}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("application/x-mvs-asset")) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }
                  }}
                  onDrop={(e) => onDropOnTrack(e, track.id)}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      clearSelection();
                      seekFromEvent(e.clientX);
                    }
                  }}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-[0.35]"
                    style={{
                      backgroundImage: `repeating-linear-gradient(to right, var(--md-outline-variant) 0 1px, transparent 1px ${Math.max(
                        24,
                        rulerStep(pps).major * pps,
                      )}px)`,
                    }}
                  />
                  {(clipsByTrack.get(track.id) ?? []).map((clip) => (
                      <div key={clip.id} data-clip>
                        <ClipView
                          clip={clip}
                          asset={"assetId" in clip ? assetMap.get(clip.assetId) : undefined}
                          pps={pps}
                          height={track.height}
                          selected={selection.includes(clip.id)}
                          locked={track.locked}
                          onPointerDown={onClipPointerDown}
                          onDoubleClick={onClipDoubleClick}
                          onContextMenu={onClipContextMenu}
                          onDropEffect={onDropEffect}
                          onDropTransition={onDropTransition}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
            {project.clips.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="rounded-full bg-surf px-4 py-2 text-[12px] text-on-surface-variant">
                  Przeciągnij materiały z biblioteki, aby rozpocząć montaż
                </p>
              </div>
            )}
          </div>

          {/* snap guide */}
          {guide !== null && (
            <div
              className="pointer-events-none absolute top-0 z-30 h-full w-px bg-tertiary"
              style={{ left: HEADER_WIDTH + guide * pps }}
            />
          )}

          {/* playhead */}
          <div ref={playheadRef} className="pointer-events-none absolute top-0 z-40 h-full will-change-transform" style={{ left: 0 }}>
            <div className="relative h-full w-px bg-error">
              <div className="absolute -left-[7px] top-0 h-3 w-[15px] rounded-b-[4px] bg-error" />
            </div>
          </div>
        </div>
      </div>

      {menu && (
        <ClipContextMenu
          x={menu.x}
          y={menu.y}
          clipId={menu.clipId}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}

function RulerTicks({ pps, width }: { pps: number; width: number }) {
  const { major, minor } = rulerStep(pps);
  const total = Math.ceil(width / pps);
  const ticks: { t: number; major: boolean }[] = [];
  for (let t = 0; t <= total; t += minor) {
    ticks.push({ t, major: Math.abs(t / major - Math.round(t / major)) < 1e-6 });
  }
  return (
    <>
      {ticks.map(({ t, major: isMajor }) => (
        <div key={t} className="absolute bottom-0 select-none" style={{ left: t * pps }}>
          <div className={cn("w-px bg-outline-variant", isMajor ? "h-3" : "h-1.5")} />
          {isMajor && (
            <span className="absolute bottom-3 left-1 whitespace-nowrap font-mono text-[9px] text-on-surface-variant">
              {formatTime(t, false)}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

function ClipContextMenu({
  x,
  y,
  clipId,
  onClose,
}: {
  x: number;
  y: number;
  clipId: string;
  onClose: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const store = useProjectStore.getState();
  const ui = useUiStore.getState();
  const clip = project.clips.find((c) => c.id === clipId);
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
  if (!clip) return null;
  const isMedia = clip.type === "video" || clip.type === "audio";
  const items: { id: string; label: string; icon: string; danger?: boolean; action: () => void }[] = [
    { id: "split", label: "Podziel w playheadzie", icon: "content_cut", action: () => store.splitClips([clipId], playbackEngine.time) },
    { id: "dup", label: "Duplikuj", icon: "library_add", action: () => ui.select(store.duplicateClips([clipId])) },
    { id: "copy", label: "Kopiuj", icon: "content_copy", action: () => store.copyClips([clipId]) },
  ];
  if (clip.type === "video") {
    items.push({ id: "detach", label: "Odłącz audio", icon: "call_split", action: () => store.detachAudio(clipId) });
    items.push({
      id: "freeze",
      label: clip.freezeFrame ? "Wyłącz stop-klatkę" : "Stop-klatka",
      icon: "ac_unit",
      action: () => store.updateClip(clipId, { freezeFrame: !clip.freezeFrame } as Partial<Clip>),
    });
  }
  if (isMedia) {
    items.push({
      id: "rev",
      label: clip.reverse ? "Wyłącz odwrócenie" : "Odwróć",
      icon: "fast_rewind",
      action: () => store.updateClip(clipId, { reverse: !clip.reverse } as Partial<Clip>),
    });
  }
  items.push({ id: "del", label: "Usuń", icon: "delete", danger: true, action: () => store.deleteClips([clipId]) });

  return (
    <div
      role="menu"
      className="fixed z-[150] min-w-[210px] overflow-hidden rounded-[12px] bg-surf-high py-2 shadow-2xl ring-1 ring-outline-variant anim-scale"
      style={{ left: Math.min(x, window.innerWidth - 230), top: Math.min(y, window.innerHeight - 260) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          role="menuitem"
          onClick={() => {
            item.action();
            onClose();
          }}
          className={cn(
            "state-layer flex w-full items-center gap-3 px-4 py-2 text-left text-[13px]",
            item.danger ? "text-error" : "text-on-surface",
          )}
        >
          <Icon name={item.icon} size={18} className="text-on-surface-variant" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
