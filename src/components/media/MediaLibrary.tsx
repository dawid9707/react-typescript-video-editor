import { useMemo, useState, type DragEvent } from "react";
import type { EffectType, MediaAsset, ShapeType, TransitionType } from "@/types";
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  SegmentedButtons,
  Tabs,
  TextField,
  Tooltip,
} from "@/components/ui";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore, type LibraryTab } from "@/stores/uiStore";
import { useMediaImport } from "@/hooks/useMediaImport";
import { EFFECT_DEFAULTS, createEffect } from "@/features/project/factory";
import { formatBytes, formatTime, uid } from "@/utils/format";
import { playbackEngine } from "@/services/playback/engine";
import { cn } from "@/utils/cn";

const TABS: { value: LibraryTab; label: string; icon: string }[] = [
  { value: "media", label: "Media", icon: "perm_media" },
  { value: "audio", label: "Audio", icon: "graphic_eq" },
  { value: "subtitles", label: "Napisy", icon: "subtitles" },
  { value: "effects", label: "Efekty", icon: "auto_fix_high" },
  { value: "transitions", label: "Przejścia", icon: "transition_fade" },
  { value: "text", label: "Tekst", icon: "title" },
  { value: "shapes", label: "Kształty", icon: "shapes" },
];

const TRANSITIONS: { type: TransitionType; label: string; icon: string }[] = [
  { type: "cut", label: "Cięcie", icon: "content_cut" },
  { type: "dissolve", label: "Przenikanie", icon: "transition_fade" },
  { type: "fade", label: "Fade", icon: "gradient" },
  { type: "dipToBlack", label: "Przez czerń", icon: "dark_mode" },
  { type: "dipToWhite", label: "Przez biel", icon: "light_mode" },
  { type: "slide", label: "Slide", icon: "swipe_left" },
  { type: "push", label: "Push", icon: "double_arrow" },
  { type: "zoom", label: "Zoom", icon: "zoom_out_map" },
];

const TEXT_PRESETS = [
  { id: "title", label: "Tytuł", text: "Tytuł filmu", size: 96, icon: "title" },
  { id: "subtitle", label: "Podtytuł", text: "Podtytuł", size: 56, icon: "text_fields" },
  { id: "lower", label: "Belka dolna", text: "Imię Nazwisko\nOpis", size: 44, icon: "branding_watermark" },
  { id: "caption", label: "Podpis", text: "Podpis", size: 36, icon: "closed_caption" },
];

const SHAPES: { type: ShapeType; label: string; icon: string; detail: string }[] = [
  { type: "rectangle", label: "Prostokąt", icon: "rectangle", detail: "Wypełniony" },
  { type: "ellipse", label: "Elipsa", icon: "circle", detail: "Wypełniona" },
  { type: "line", label: "Linia", icon: "horizontal_rule", detail: "Kontur" },
  { type: "arrow", label: "Strzałka", icon: "arrow_forward", detail: "Kontur" },
];

function assetDuration(a: MediaAsset): number {
  return "duration" in a ? a.duration : 5;
}

function AssetThumb({ asset, size = 56 }: { asset: MediaAsset; size?: number }) {
  const thumb = "thumbnail" in asset ? asset.thumbnail : undefined;
  const icon =
    asset.kind === "audio" ? "graphic_eq" : asset.kind === "subtitle" ? "subtitles" : asset.kind === "image" ? "image" : "movie";
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-[10px] bg-surf-highest"
      style={{ width: size, height: (size * 9) / 16 }}
    >
      {thumb ? (
        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Icon name={icon} size={size / 3} className="text-on-surface-variant" />
      )}
    </div>
  );
}

function AssetCard({
  asset,
  view,
  selected,
  onOpen,
  onAdd,
  onRemove,
}: {
  asset: MediaAsset;
  view: "grid" | "list";
  selected: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const meta: string[] = [];
  if (asset.kind === "video") meta.push(`${asset.width}×${asset.height}`, `${asset.fps} fps`, asset.videoCodec);
  if (asset.kind === "audio") meta.push(`${asset.channels} ch`, `${(asset.sampleRate / 1000).toFixed(1)} kHz`, asset.audioCodec);
  if (asset.kind === "subtitle") meta.push(`${asset.cues.length} napisów`, asset.format.toUpperCase());
  if (asset.kind === "image") meta.push(`${asset.width}×${asset.height}`);

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData("application/x-mvs-asset", asset.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  if (view === "list") {
    return (
      <div
        draggable
        onDragStart={onDragStart}
        onClick={onOpen}
        onDoubleClick={onAdd}
        className={cn(
          "state-layer group flex cursor-grab items-center gap-3 rounded-[12px] bg-surf-low p-2 active:cursor-grabbing",
          selected && "ring-2 ring-primary",
        )}
      >
        <AssetThumb asset={asset} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-on-surface">{asset.name}</p>
          <p className="truncate text-[11px] text-on-surface-variant">
            {formatTime(assetDuration(asset), false)} · {meta.join(" · ")} · {formatBytes(asset.size)}
          </p>
        </div>
        <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton icon="add" label="Dodaj na oś czasu" size={32} onClick={(e) => { e.stopPropagation(); onAdd(); }} />
          <IconButton icon="delete" label="Usuń z biblioteki" size={32} onClick={(e) => { e.stopPropagation(); onRemove(); }} />
        </div>
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onDoubleClick={onAdd}
      className={cn(
        "group relative cursor-grab overflow-hidden rounded-[14px] bg-surf-low transition-shadow hover:shadow-md active:cursor-grabbing",
        selected && "ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-surf-highest">
        {"thumbnail" in asset && asset.thumbnail ? (
          <img src={asset.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center">
            <Icon
              name={asset.kind === "audio" ? "graphic_eq" : asset.kind === "subtitle" ? "subtitles" : "movie"}
              size={28}
              className="text-on-surface-variant"
            />
          </div>
        )}
        <span className="absolute bottom-1 right-1 rounded-[6px] bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {formatTime(assetDuration(asset), false)}
        </span>
        <div className="absolute inset-x-1 top-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <IconButton
            icon="add"
            label="Dodaj na oś czasu"
            size={28}
            variant="filled"
            className="bg-surface/90"
            onClick={(e) => { e.stopPropagation(); onAdd(); }}
          />
          <IconButton
            icon="delete"
            label="Usuń z biblioteki"
            size={28}
            variant="filled"
            className="bg-surface/90"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          />
        </div>
      </div>
      <div className="p-2">
        <p className="truncate text-[12px] font-medium text-on-surface">{asset.name}</p>
        <p className="truncate text-[10px] text-on-surface-variant">{meta.join(" · ") || formatBytes(asset.size)}</p>
      </div>
    </div>
  );
}

export function MediaLibrary() {
  const assets = useProjectStore((s) => s.project.assets);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const addAssetToTimeline = useProjectStore((s) => s.addAssetToTimeline);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const addShapeClip = useProjectStore((s) => s.addShapeClip);
  const addEffect = useProjectStore((s) => s.addEffect);
  const setTransition = useProjectStore((s) => s.setTransition);
  const addSubtitleCues = useProjectStore((s) => s.addSubtitleCues);

  const tab = useUiStore((s) => s.libraryTab);
  const setTab = useUiStore((s) => s.setLibraryTab);
  const view = useUiStore((s) => s.libraryView);
  const setView = useUiStore((s) => s.setLibraryView);
  const search = useUiStore((s) => s.librarySearch);
  const setSearch = useUiStore((s) => s.setLibrarySearch);
  const sort = useUiStore((s) => s.librarySort);
  const setSort = useUiStore((s) => s.setLibrarySort);
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const setSelectedAsset = useUiStore((s) => s.setSelectedAsset);
  const setPreviewAsset = useUiStore((s) => s.setPreviewAsset);
  const selectedClipIds = useUiStore((s) => s.selectedClipIds);
  const notify = useUiStore((s) => s.notify);
  const select = useUiStore((s) => s.select);

  const { pickFiles, importFiles } = useMediaImport();
  const [dragOver, setDragOver] = useState(false);
  const [subtitlesView, setSubtitlesView] = useState<"add" | "import">("add");

  const filtered = useMemo(() => {
    const kinds =
      tab === "audio" ? ["audio"] : tab === "subtitles" ? ["subtitle"] : ["video", "image"];
    let list = assets.filter((a) => kinds.includes(a.kind));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a) => a.name.toLowerCase().includes(q) || a.fileName.toLowerCase().includes(q));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "size") return b.size - a.size;
      if (sort === "duration") return assetDuration(b) - assetDuration(a);
      return b.importedAt - a.importedAt;
    });
    return sorted;
  }, [assets, tab, search, sort]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void importFiles(files);
  };

  const addToTimeline = (assetId: string) => {
    const id = addAssetToTimeline(assetId, undefined, playbackEngine.time);
    if (id) {
      select([id]);
      notify("Dodano na oś czasu.");
    } else notify({ text: "Brak pasującej ścieżki dla tego materiału.", tone: "error" });
  };

  const applyEffect = (type: EffectType) => {
    if (!selectedClipIds.length) {
      notify({ text: "Zaznacz klip, aby dodać efekt.", tone: "error" });
      return;
    }
    for (const id of selectedClipIds) addEffect(id, createEffect(type));
    notify(`Dodano efekt: ${EFFECT_DEFAULTS[type].label}`);
  };

  const applyTransition = (type: TransitionType) => {
    if (!selectedClipIds.length) {
      notify({ text: "Zaznacz klip, aby dodać przejście.", tone: "error" });
      return;
    }
    for (const id of selectedClipIds) {
      setTransition(id, "in", type === "cut" ? undefined : { id: uid("tr"), type, duration: 0.8 });
    }
    notify(`Przejście wejściowe: ${TRANSITIONS.find((t) => t.type === type)?.label}`);
  };

  return (
    <section
      aria-label="Biblioteka projektu"
      className={cn(
        "flex h-full flex-col overflow-hidden bg-surf-low",
        dragOver && "outline outline-2 -outline-offset-2 outline-primary",
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="shrink-0 bg-surf-low" />

      {(tab === "media" || tab === "audio" || tab === "subtitles") && (
        <div className="flex flex-col gap-2 p-3 pb-2">
          <Button icon="upload_file" variant="tonal" onClick={pickFiles} className="w-full">
            Importuj multimedia
          </Button>
          <div className="flex items-center gap-2">
            <TextField
              placeholder="Szukaj…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1"
              trailing={search ? <IconButton icon="close" label="Wyczyść" size={28} onClick={() => setSearch("")} /> : undefined}
            />
            <SegmentedButtons
              dense
              className="shrink-0"
              value={view}
              onChange={setView}
              options={[
                { value: "grid", label: "", icon: "grid_view" },
                { value: "list", label: "", icon: "view_list" },
              ]}
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {(["recent", "name", "duration", "size"] as const).map((s) => (
              <Chip
                key={s}
                label={{ recent: "Ostatnie", name: "Nazwa", duration: "Długość", size: "Rozmiar" }[s]}
                selected={sort === s}
                onClick={() => setSort(s)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {tab === "subtitles" && (
          <div className="mb-4">
            <SegmentedButtons
              options={[
                { value: "add", label: "Twórz" },
                { value: "import", label: "Z plików" },
              ]}
              value={subtitlesView}
              onChange={(v) => setSubtitlesView(v as "add" | "import")}
            />
          </div>
        )}

        {(tab === "media" || tab === "audio" || (tab === "subtitles" && subtitlesView === "import")) &&
          (filtered.length === 0 ? (
            <EmptyState
              icon={tab === "audio" ? "graphic_eq" : tab === "subtitles" ? "subtitles" : "video_library"}
              title={assets.length ? "Brak materiałów w tej kategorii" : "Twój projekt jest pusty"}
              description={
                assets.length
                  ? "Zaimportuj pliki lub zmień kategorię."
                  : "Przeciągnij tutaj pliki wideo, audio lub napisy albo kliknij Importuj multimedia powyżej."
              }
            />
          ) : (
            <div className={cn(view === "grid" ? "grid grid-cols-2 gap-2 xl:grid-cols-3" : "flex flex-col gap-1.5")}>
              {filtered.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  view={view}
                  selected={selectedAssetId === asset.id}
                  onOpen={() => {
                    setSelectedAsset(asset.id);
                    setPreviewAsset(asset.id);
                  }}
                  onAdd={() => addToTimeline(asset.id)}
                  onRemove={() => removeAsset(asset.id)}
                />
              ))}
            </div>
          ))}

        {tab === "subtitles" && subtitlesView === "add" && (
          <div className="rounded-[14px] bg-surf p-3">
            <p className="mb-3 text-[12px] text-on-surface-variant">
              Utwórz pojedynczy napis w miejscu playheada na osi czasu.
            </p>
            <Button
              className="w-full"
              variant="outlined"
              icon="add_comment"
              onClick={() => {
                addSubtitleCues([
                  { id: uid("cue"), start: playbackEngine.time, end: playbackEngine.time + 2.5, text: "Nowy napis" },
                ]);
                notify("Dodano napis na ścieżce S1.");
              }}
            >
              Nowy napis
            </Button>
          </div>
        )}

        {tab === "effects" && (
          <div className="grid grid-cols-2 gap-2 pt-3">
            {(Object.keys(EFFECT_DEFAULTS) as EffectType[]).map((type) => (
              <button
                key={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-mvs-effect", type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => applyEffect(type)}
                className="state-layer flex cursor-grab flex-col items-start gap-1.5 rounded-[14px] bg-surf-low p-3 text-left active:cursor-grabbing"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-tertiary-container text-on-tertiary-container">
                  <Icon name={EFFECT_DEFAULTS[type].icon} size={20} />
                </span>
                <span className="text-[12px] font-medium text-on-surface">{EFFECT_DEFAULTS[type].label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "transitions" && (
          <div className="grid grid-cols-2 gap-2 pt-3">
            {TRANSITIONS.map((t) => (
              <button
                key={t.type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-mvs-transition", t.type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => applyTransition(t.type)}
                className="state-layer flex cursor-grab flex-col items-start gap-1.5 rounded-[14px] bg-surf-low p-3 text-left active:cursor-grabbing"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-container text-on-primary-container">
                  <Icon name={t.icon} size={20} />
                </span>
                <span className="text-[12px] font-medium text-on-surface">{t.label}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "text" && (
          <div className="flex flex-col gap-2 pt-3">
            {TEXT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  const id = addTextClip(undefined, playbackEngine.time, preset.text);
                  if (id) {
                    select([id]);
                    notify("Dodano warstwę tekstową.");
                  } else notify({ text: "Brak ścieżki wideo dla tekstu.", tone: "error" });
                }}
                className="state-layer flex items-center gap-3 rounded-[14px] bg-surf-low p-3 text-left"
              >
                <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-secondary-container text-on-secondary-container">
                  <Icon name={preset.icon} size={20} />
                </span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-on-surface">{preset.label}</span>
                  <span className="block text-[11px] text-on-surface-variant">{preset.size} px · animacja fade</span>
                </span>
                <Icon name="add" size={18} className="text-on-surface-variant" />
              </button>
            ))}
            <p className="px-1 pt-2 text-[11px] text-on-surface-variant">
              Warstwa tekstowa trafia na najwyższą ścieżkę wideo i może być dowolnie przesuwana oraz stylowana
              w inspektorze.
            </p>
          </div>
        )}

        {tab === "shapes" && (
          <div className="grid grid-cols-2 gap-2 pt-3">
            {SHAPES.map((shape) => (
              <button
                key={shape.type}
                onClick={() => {
                  const id = addShapeClip(undefined, playbackEngine.time, shape.type);
                  if (id) {
                    select([id]);
                    notify(`Dodano: ${shape.label}.`);
                  } else notify({ text: "Brak ścieżki wideo dla kształtu.", tone: "error" });
                }}
                className="state-layer flex flex-col items-start gap-1.5 rounded-[14px] bg-surf-low p-3 text-left"
              >
                <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-tertiary-container text-on-tertiary-container">
                  <Icon name={shape.icon} size={20} />
                </span>
                <span className="text-[12px] font-medium text-on-surface">{shape.label}</span>
                <span className="text-[10px] text-on-surface-variant">{shape.detail}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-outline-variant px-3 py-2">
        <Tooltip label="Pliki nie opuszczają Twojego urządzenia">
          <p className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
            <Icon name="lock" size={14} />
            Przetwarzanie lokalne w przeglądarce
          </p>
        </Tooltip>
      </div>
    </section>
  );
}
