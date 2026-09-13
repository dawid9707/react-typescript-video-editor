import { useMemo, useState, type ReactNode } from "react";
import type { AudioClip, BlendMode, Clip, ShapeClip, ShapeType, SubtitleClip, TextClip, VideoClip } from "@/types";
import {
  Button,
  Chip,
  EmptyState,
  Icon,
  IconButton,
  ParamRow,
  SectionHeader,
  SegmentedButtons,
  Select,
  Switch,
  Tabs,
  TextField,
} from "@/components/ui";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { EFFECT_DEFAULTS } from "@/features/project/factory";
import { formatTime } from "@/utils/format";
import { playbackEngine } from "@/services/playback/engine";

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "hard-light",
  "soft-light",
  "difference",
  "luminosity",
];

const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 4];

function InspectorSection({
  title,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-outline-variant/60 pb-1 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="state-layer flex min-h-9 w-full items-center gap-2 rounded-[8px] px-1 py-2 text-left"
      >
        {icon && <Icon name={icon} size={16} className="text-on-surface-variant" />}
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">{title}</span>
        <Icon name={open ? "expand_less" : "expand_more"} size={18} className="text-on-surface-variant" />
      </button>
      {open && <div className="pb-1">{children}</div>}
    </section>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[12px] text-on-surface-variant">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value.startsWith("#") ? value : "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-7 w-10 cursor-pointer rounded-[6px] border border-outline-variant bg-transparent"
        />
        <span className="font-mono text-[10px] uppercase text-on-surface-variant">{value}</span>
      </span>
    </label>
  );
}

function EffectsSection({ clip }: { clip: VideoClip | TextClip }) {
  const updateEffect = useProjectStore((s) => s.updateEffect);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const reorderEffect = useProjectStore((s) => s.reorderEffect);
  const setLibraryTab = useUiStore((s) => s.setLibraryTab);

  if (!clip.effects.length) {
    return (
      <EmptyState
        compact
        icon="auto_fix_high"
        title="Brak efektów"
        description="Przeciągnij efekt z biblioteki na klip albo wybierz go z zakładki Efekty."
        action={
          <Button variant="outlined" icon="add" onClick={() => setLibraryTab("effects")}>
            Otwórz efekty
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {clip.effects.map((fx, index) => (
        <div key={fx.id} className="rounded-[12px] bg-surf p-2.5">
          <div className="flex items-center gap-1">
            <Icon name={EFFECT_DEFAULTS[fx.type].icon} size={16} className="text-on-surface-variant" />
            <span className="flex-1 text-[12px] font-medium text-on-surface">{EFFECT_DEFAULTS[fx.type].label}</span>
            <Switch checked={fx.enabled} onChange={(v) => updateEffect(clip.id, fx.id, { enabled: v })} label="Włącz efekt" />
            <IconButton icon="arrow_upward" label="W górę" size={28} disabled={index === 0} onClick={() => reorderEffect(clip.id, fx.id, -1)} />
            <IconButton icon="arrow_downward" label="W dół" size={28} disabled={index === clip.effects.length - 1} onClick={() => reorderEffect(clip.id, fx.id, 1)} />
            <IconButton icon="delete" label="Usuń efekt" size={28} onClick={() => removeEffect(clip.id, fx.id)} />
          </div>
          {fx.enabled && (
            <div className="pt-1">
              {Object.entries(fx.params).map(([key, value]) => {
                const labelMap: Record<string, string> = {
                  amount: "Intensywność",
                  radius: "Rozmycie",
                  x: "Przesunięcie X",
                  y: "Przesunięcie Y",
                  blur: "Rozmycie",
                  size: "Rozmiar",
                  density: "Gęstość",
                  frequency: "Częstotliwość",
                  rgbSplit: "Rozszczepienie RGB",
                  shift: "Przesunięcie",
                  noise: "Szum",
                  degrade: "Degradacja (ntsc)",
                  bleed: "Bleed (ntsc)",
                  head: "Głowica (ntsc)",
                  tracking: "Taśma (ntsc)",
                  jitter: "Jitter (ntsc)",
                };
                return (
                <ParamRow
                  key={key}
                  label={labelMap[key] || key}
                  value={value}
                  min={key === "angle" ? -180 : key === "blur" || key === "radius" ? 0 : key === "x" || key === "y" ? -100 : key === "density" ? 2 : 0}
                  max={key === "angle" ? 180 : key === "radius" || key === "blur" ? 40 : key === "x" || key === "y" ? 100 : key === "size" && fx.type === "pixelate" ? 100 : key === "density" ? 20 : 2}
                  step={key === "size" && fx.type === "pixelate" ? 1 : key === "density" ? 1 : 0.01}
                  defaultValue={EFFECT_DEFAULTS[fx.type].params[key] ?? 0}
                  onChange={(v) => updateEffect(clip.id, fx.id, { params: { [key]: v } })}
                />
                );
              })}
              {fx.color && <ColorInput label="Kolor" value={fx.color} onChange={(v) => updateEffect(clip.id, fx.id, { color: v })} />}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function TransitionSection({ clip }: { clip: Clip }) {
  const setTransition = useProjectStore((s) => s.setTransition);
  const types = ["dissolve", "fade", "dipToBlack", "dipToWhite", "slide", "push", "zoom"] as const;
  return (
    <div className="flex flex-col gap-3">
      {(["in", "out"] as const).map((side) => {
        const t = side === "in" ? clip.transitionIn : clip.transitionOut;
        return (
          <div key={side} className="rounded-[12px] bg-surf p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-on-surface">
                {side === "in" ? "Przejście wejściowe" : "Przejście wyjściowe"}
              </span>
              {t && <IconButton icon="close" label="Usuń przejście" size={28} onClick={() => setTransition(clip.id, side, undefined)} />}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {types.map((type) => (
                <Chip
                  key={type}
                  label={type}
                  selected={t?.type === type}
                  onClick={() =>
                    setTransition(clip.id, side, {
                      id: t?.id ?? `tr_${type}_${clip.id}_${side}`,
                      type,
                      duration: t?.duration ?? 0.8,
                    })
                  }
                />
              ))}
            </div>
            {t && (
              <ParamRow
                label="Czas trwania"
                unit="s"
                value={t.duration}
                min={0.1}
                max={Math.min(4, clip.duration)}
                step={0.05}
                defaultValue={0.8}
                onChange={(v) => setTransition(clip.id, side, { ...t, duration: v })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function VideoInspector({ clip }: { clip: VideoClip }) {
  const update = useProjectStore((s) => s.updateClip);
  const setSpeed = useProjectStore((s) => s.setClipSpeed);
  const tab = useUiStore((s) => s.inspectorTab);
  const setTab = useUiStore((s) => s.setInspectorTab);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "video", label: "Obraz", icon: "crop_rotate" },
          { value: "color", label: "Kolor", icon: "palette" },
          { value: "audio", label: "Audio", icon: "volume_up" },
          { value: "effects", label: "Efekty", icon: "auto_fix_high" },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        {tab === "video" && (
          <>
            <SectionHeader title="Transform" icon="open_with" />
            <ParamRow label="Pozycja X" unit="%" value={clip.transform.x} min={-100} max={100} step={0.5} onChange={(v) => update(clip.id, { transform: { ...clip.transform, x: v } } as Partial<Clip>)} />
            <ParamRow label="Pozycja Y" unit="%" value={clip.transform.y} min={-100} max={100} step={0.5} onChange={(v) => update(clip.id, { transform: { ...clip.transform, y: v } } as Partial<Clip>)} />
            <ParamRow label="Skala" value={clip.transform.scale} min={0.05} max={4} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { transform: { ...clip.transform, scale: v } } as Partial<Clip>)} />
            <ParamRow label="Obrót" unit="°" value={clip.transform.rotation} min={-180} max={180} step={1} precision={0} onChange={(v) => update(clip.id, { transform: { ...clip.transform, rotation: v } } as Partial<Clip>)} />
            <ParamRow label="Punkt kotwiczenia X" unit="%" value={clip.transform.anchorX} min={-50} max={50} step={1} onChange={(v) => update(clip.id, { transform: { ...clip.transform, anchorX: v } } as Partial<Clip>)} />
            <ParamRow label="Punkt kotwiczenia Y" unit="%" value={clip.transform.anchorY} min={-50} max={50} step={1} onChange={(v) => update(clip.id, { transform: { ...clip.transform, anchorY: v } } as Partial<Clip>)} />

            <SectionHeader title="Wygląd" icon="opacity" />
            <ParamRow label="Krycie" value={clip.opacity} min={0} max={1} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { opacity: v } as Partial<Clip>)} />
            <Select
              label="Tryb mieszania"
              value={clip.blendMode}
              options={BLEND_MODES.map((m) => ({ value: m, label: m }))}
              onChange={(v) => update(clip.id, { blendMode: v } as Partial<Clip>)}
              className="py-1"
            />

            <SectionHeader title="Prędkość" icon="speed" />
            <div className="flex flex-wrap gap-1.5 py-1">
              {SPEED_PRESETS.map((s) => (
                <Chip key={s} label={`${s}×`} selected={Math.abs(clip.speed - s) < 0.001} onClick={() => setSpeed(clip.id, s)} />
              ))}
            </div>
            <ParamRow label="Prędkość" unit="×" value={clip.speed} min={0.1} max={8} step={0.05} defaultValue={1} onChange={(v) => setSpeed(clip.id, v)} />
            <label className="flex items-center justify-between py-1.5">
              <span className="text-[12px] text-on-surface-variant">Odtwarzanie wstecz</span>
              <Switch checked={clip.reverse} onChange={(v) => update(clip.id, { reverse: v } as Partial<Clip>)} label="Odwróć" />
            </label>
            <label className="flex items-center justify-between py-1.5">
              <span className="text-[12px] text-on-surface-variant">Stop-klatka</span>
              <Switch checked={clip.freezeFrame} onChange={(v) => update(clip.id, { freezeFrame: v } as Partial<Clip>)} label="Stop-klatka" />
            </label>

            <SectionHeader title="Automatyczna poprawa" icon="auto_awesome" />
            <div className="flex flex-wrap gap-1.5 py-1">
              <Button
                variant="tonal"
                icon="auto_awesome"
                onClick={() => useProjectStore.getState().addEffect(clip.id, { id: `fx_enhance_${clip.id}`, type: "enhance", enabled: true, params: { amount: 0.45, detail: 0.35 } })}
              >
                Popraw jakość
              </Button>
              <Button
                variant="tonal"
                icon="motion_blur"
                onClick={() => useProjectStore.getState().addEffect(clip.id, { id: `fx_stabilize_${clip.id}`, type: "stabilize", enabled: true, params: { amount: 0.65, crop: 0.08 } })}
              >
                Stabilizuj
              </Button>
            </div>

            <SectionHeader title="Kadrowanie" icon="crop" />
            {(["top", "bottom", "left", "right"] as const).map((edge) => (
              <ParamRow
                key={edge}
                label={{ top: "Góra", bottom: "Dół", left: "Lewa", right: "Prawa" }[edge]}
                unit="%"
                value={clip.crop[edge]}
                min={0}
                max={45}
                step={0.5}
                onChange={(v) => update(clip.id, { crop: { ...clip.crop, [edge]: v } } as Partial<Clip>)}
              />
            ))}

            <SectionHeader title="Blur fragmentu" icon="blur_on" />
            {clip.blurRegion ? (
              <>
                <Select
                  label="Kształt obszaru"
                  value={clip.blurRegion.shape}
                  options={[{ value: "rectangle", label: "Prostokąt" }, { value: "ellipse", label: "Elipsa" }]}
                  onChange={(v) => update(clip.id, { blurRegion: { ...clip.blurRegion!, shape: v as "rectangle" | "ellipse" } } as Partial<Clip>)}
                  className="py-1"
                />
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <ParamRow
                    key={key}
                    label={{ x: "Pozycja X", y: "Pozycja Y", width: "Szerokość", height: "Wysokość" }[key]}
                    unit="%"
                    value={clip.blurRegion![key]}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => update(clip.id, { blurRegion: { ...clip.blurRegion!, [key]: v } } as Partial<Clip>)}
                  />
                ))}
                <ParamRow label="Siła blur" unit="px" value={clip.blurRegion.radius} min={1} max={60} step={1} onChange={(v) => update(clip.id, { blurRegion: { ...clip.blurRegion!, radius: v } } as Partial<Clip>)} />
                <Button variant="outlined" icon="close" className="mt-2 w-full" onClick={() => update(clip.id, { blurRegion: undefined } as Partial<Clip>)}>
                  Usuń obszar blur
                </Button>
              </>
            ) : (
              <Button
                variant="tonal"
                icon="blur_on"
                className="my-1 w-full"
                onClick={() => update(clip.id, { blurRegion: { x: 25, y: 25, width: 50, height: 50, radius: 18, shape: "rectangle" } } as Partial<Clip>)}
              >
                Dodaj obszar blur
              </Button>
            )}

            <SectionHeader title="Przejścia" icon="transition_fade" />
            <TransitionSection clip={clip} />
          </>
        )}

        {tab === "color" && (
          <>
            <InspectorSection title="Korekcja obrazu" icon="tune">
              <ParamRow label="Ekspozycja" value={clip.color.exposure} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, exposure: v } } as Partial<Clip>)} />
              <ParamRow label="Kontrast" value={clip.color.contrast} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, contrast: v } } as Partial<Clip>)} />
              <ParamRow label="Nasycenie" value={clip.color.saturation} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, saturation: v } } as Partial<Clip>)} />
              <ParamRow label="Temperatura" value={clip.color.temperature} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, temperature: v } } as Partial<Clip>)} />
              <ParamRow label="Tinta" value={clip.color.tint} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, tint: v } } as Partial<Clip>)} />
              <ParamRow label="Światła" value={clip.color.highlights} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, highlights: v } } as Partial<Clip>)} />
              <ParamRow label="Cienie" value={clip.color.shadows} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { color: { ...clip.color, shadows: v } } as Partial<Clip>)} />
            <Button
              variant="outlined"
              icon="restart_alt"
              className="mt-3 w-full"
              onClick={() =>
                update(clip.id, {
                  color: { exposure: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 },
                } as Partial<Clip>)
              }
            >
              Resetuj korekcję
              </Button>
            </InspectorSection>
          </>
        )}

        {tab === "audio" && (
          <>
            <SectionHeader title="Audio klipu" icon="volume_up" />
            <label className="flex items-center justify-between py-1.5">
              <span className="text-[12px] text-on-surface-variant">Wycisz</span>
              <Switch checked={clip.muted} onChange={(v) => update(clip.id, { muted: v } as Partial<Clip>)} label="Wycisz" />
            </label>
            <ParamRow label="Głośność" value={clip.volume} min={0} max={2} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { volume: v } as Partial<Clip>)} />
            <ParamRow label="Fade in" unit="s" value={clip.fadeIn} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(v) => update(clip.id, { fadeIn: v } as Partial<Clip>)} />
            <ParamRow label="Fade out" unit="s" value={clip.fadeOut} min={0} max={Math.min(5, clip.duration / 2)} step={0.05} onChange={(v) => update(clip.id, { fadeOut: v } as Partial<Clip>)} />
            <SectionHeader title="Poprawa dźwięku" icon="auto_awesome" />
            <ParamRow label="Usuwanie szumu" value={clip.noiseReduction ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { noiseReduction: v } as Partial<Clip>)} />
            <ParamRow label="Czytelność głosu" value={clip.voiceEnhance ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { voiceEnhance: v } as Partial<Clip>)} />
            <ParamRow label="Kompresja" value={clip.compressor ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { compressor: v } as Partial<Clip>)} />
            <Button variant="tonal" icon="call_split" className="mt-3 w-full" onClick={() => useProjectStore.getState().detachAudio(clip.id)}>
              Odłącz audio na ścieżkę A
            </Button>
          </>
        )}

        {tab === "effects" && (
          <div className="pt-3">
            <EffectsSection clip={clip} />
          </div>
        )}
      </div>
    </div>
  );
}

function ShapeInspector({ clip }: { clip: ShapeClip }) {
  const update = useProjectStore((s) => s.updateClip);
  const patch = (next: Partial<ShapeClip>) => update(clip.id, next as Partial<Clip>);
  const patchTransform = (key: keyof ShapeClip["transform"], value: number) => patch({ transform: { ...clip.transform, [key]: value } });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <InspectorSection title="Kształt" icon="shapes">
        <Select
          label="Typ"
          value={clip.shape}
          options={(["rectangle", "ellipse", "line", "arrow"] as ShapeType[]).map((value) => ({ value, label: { rectangle: "Prostokąt", ellipse: "Elipsa", line: "Linia", arrow: "Strzałka" }[value] }))}
          onChange={(value) => patch({ shape: value as ShapeType })}
          className="py-1"
        />
        <ParamRow label="Pozycja X" unit="%" value={clip.transform.x} min={-100} max={100} step={0.5} onChange={(v) => patchTransform("x", v)} />
        <ParamRow label="Pozycja Y" unit="%" value={clip.transform.y} min={-100} max={100} step={0.5} onChange={(v) => patchTransform("y", v)} />
        <ParamRow label="Szerokość" unit="%" value={clip.width} min={1} max={100} step={1} onChange={(v) => patch({ width: v })} />
        <ParamRow label="Wysokość" unit="%" value={clip.height} min={0} max={100} step={1} onChange={(v) => patch({ height: v })} />
        <ParamRow label="Obrót" unit="°" value={clip.transform.rotation} min={-180} max={180} step={1} onChange={(v) => patchTransform("rotation", v)} />
      </InspectorSection>
      <InspectorSection title="Wygląd" icon="palette">
        <ColorInput label="Wypełnienie" value={clip.fill} onChange={(v) => patch({ fill: v })} />
        <ParamRow label="Krycie wypełnienia" value={clip.fillOpacity} min={0} max={1} step={0.01} onChange={(v) => patch({ fillOpacity: v })} />
        <ColorInput label="Obrys" value={clip.stroke} onChange={(v) => patch({ stroke: v })} />
        <ParamRow label="Grubość obrysu" unit="px" value={clip.strokeWidth} min={0} max={30} step={1} onChange={(v) => patch({ strokeWidth: v })} />
        <ParamRow label="Krycie" value={clip.opacity} min={0} max={1} step={0.01} onChange={(v) => patch({ opacity: v })} />
        {clip.shape === "rectangle" && <ParamRow label="Zaokrąglenie" unit="px" value={clip.cornerRadius} min={0} max={80} step={1} onChange={(v) => patch({ cornerRadius: v })} />}
      </InspectorSection>
    </div>
  );
}

function AudioInspector({ clip }: { clip: AudioClip }) {
  const update = useProjectStore((s) => s.updateClip);
  const setSpeed = useProjectStore((s) => s.setClipSpeed);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <InspectorSection title="Poziomy" icon="volume_up">
        <ParamRow label="Głośność" value={clip.volume} min={0} max={2} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { volume: v } as Partial<Clip>)} />
        <ParamRow label="Gain" value={clip.gain} min={0} max={3} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { gain: v } as Partial<Clip>)} />
        <ParamRow label="Panorama" value={clip.pan} min={-1} max={1} step={0.01} onChange={(v) => update(clip.id, { pan: v } as Partial<Clip>)} />
      </InspectorSection>
      <InspectorSection title="Poprawa dźwięku" icon="auto_awesome">
        <ParamRow label="Usuwanie szumu" value={clip.noiseReduction ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { noiseReduction: v } as Partial<Clip>)} />
        <ParamRow label="Czytelność głosu" value={clip.voiceEnhance ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { voiceEnhance: v } as Partial<Clip>)} />
        <ParamRow label="Kompresja" value={clip.compressor ?? 0} min={0} max={1} step={0.01} defaultValue={0} onChange={(v) => update(clip.id, { compressor: v } as Partial<Clip>)} />
      </InspectorSection>
      <label className="flex items-center justify-between py-1.5">
        <span className="text-[12px] text-on-surface-variant">Wycisz fragment</span>
        <Switch checked={clip.muted} onChange={(v) => update(clip.id, { muted: v } as Partial<Clip>)} label="Wycisz" />
      </label>

      <InspectorSection title="Obwiednia" icon="show_chart">
        <ParamRow label="Fade in" unit="s" value={clip.fadeIn} min={0} max={Math.min(8, clip.duration / 2)} step={0.05} onChange={(v) => update(clip.id, { fadeIn: v } as Partial<Clip>)} />
        <ParamRow label="Fade out" unit="s" value={clip.fadeOut} min={0} max={Math.min(8, clip.duration / 2)} step={0.05} onChange={(v) => update(clip.id, { fadeOut: v } as Partial<Clip>)} />
      </InspectorSection>

      <InspectorSection title="Czas" icon="speed">
        <div className="flex flex-wrap gap-1.5 py-1">
        {SPEED_PRESETS.map((s) => (
          <Chip key={s} label={`${s}×`} selected={Math.abs(clip.speed - s) < 0.001} onClick={() => setSpeed(clip.id, s)} />
        ))}
        </div>
        <ParamRow label="Prędkość" unit="×" value={clip.speed} min={0.1} max={8} step={0.05} defaultValue={1} onChange={(v) => setSpeed(clip.id, v)} />
        <label className="flex items-center justify-between py-1.5">
        <span className="text-[12px] text-on-surface-variant">Odtwarzanie wstecz</span>
        <Switch checked={clip.reverse} onChange={(v) => update(clip.id, { reverse: v } as Partial<Clip>)} label="Odwróć" />
        </label>
      </InspectorSection>
    </div>
  );
}

function TextInspector({ clip }: { clip: TextClip | SubtitleClip }) {
  const update = useProjectStore((s) => s.updateClip);
  const isSubtitle = clip.type === "subtitle";
  const style = clip.style;
  const patchStyle = (patch: Partial<typeof style>) => update(clip.id, { style: { ...style, ...patch } } as Partial<Clip>);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
      <InspectorSection title="Treść" icon="text_fields">
        <textarea
        value={clip.text}
        onChange={(e) => update(clip.id, { text: e.target.value, label: e.target.value.slice(0, 24) } as Partial<Clip>)}
        rows={3}
        aria-label="Treść tekstu"
        className="w-full resize-y rounded-[10px] bg-surf-high p-2.5 text-[13px] text-on-surface outline-none focus:ring-2 focus:ring-primary"
        />
      </InspectorSection>

      <InspectorSection title="Typografia" icon="format_size">
        <Select
        label="Krój"
        value={style.fontFamily}
        options={[
          { value: '"Roboto Flex", system-ui, sans-serif', label: "Roboto Flex" },
          { value: '"Montserrat", sans-serif', label: "Montserrat" },
          { value: '"Open Sans", sans-serif', label: "Open Sans" },
          { value: '"Lato", sans-serif', label: "Lato" },
          { value: '"Poppins", sans-serif', label: "Poppins" },
          { value: '"Raleway", sans-serif', label: "Raleway" },
          { value: '"Ubuntu", sans-serif', label: "Ubuntu" },
          { value: '"Oswald", sans-serif', label: "Oswald" },
          { value: '"Bebas Neue", sans-serif', label: "Bebas Neue" },
          { value: '"Playfair Display", serif', label: "Playfair Display" },
          { value: '"Lora", serif', label: "Lora" },
          { value: '"Merriweather", serif', label: "Merriweather" },
          { value: '"Cinzel", serif', label: "Cinzel" },
          { value: "Georgia, serif", label: "Georgia" },
          { value: '"Pacifico", cursive', label: "Pacifico" },
          { value: '"Dancing Script", cursive', label: "Dancing Script" },
          { value: '"Caveat", cursive', label: "Caveat" },
          { value: '"Roboto Mono", monospace', label: "Roboto Mono" },
          { value: "Impact, sans-serif", label: "Impact" },
          { value: "system-ui, sans-serif", label: "System UI" },
        ]}
        onChange={(v) => patchStyle({ fontFamily: v })}
        className="py-1"
        />
        <ParamRow label="Rozmiar" unit="px" value={style.fontSize} min={12} max={220} step={1} precision={0} defaultValue={72} onChange={(v) => patchStyle({ fontSize: v })} />
        <div className="flex items-center gap-2 py-1">
        <IconButton icon="format_bold" label="Pogrubienie" selected={style.bold} onClick={() => patchStyle({ bold: !style.bold })} size={34} />
        <IconButton icon="format_italic" label="Kursywa" selected={style.italic} onClick={() => patchStyle({ italic: !style.italic })} size={34} />
        <SegmentedButtons
          dense
          className="flex-1"
          value={style.align}
          onChange={(v) => patchStyle({ align: v })}
          options={[
            { value: "left", label: "", icon: "format_align_left" },
            { value: "center", label: "", icon: "format_align_center" },
            { value: "right", label: "", icon: "format_align_right" },
          ]}
        />
        </div>
        <ParamRow label="Interlinia" value={style.lineHeight} min={0.8} max={2.5} step={0.05} defaultValue={1.2} onChange={(v) => patchStyle({ lineHeight: v })} />
      </InspectorSection>

      <InspectorSection title="Kolory" icon="palette">
        <ColorInput label="Kolor tekstu" value={style.color} onChange={(v) => patchStyle({ color: v })} />
      <ParamRow label="Krycie" value={style.opacity} min={0} max={1} step={0.01} defaultValue={1} onChange={(v) => patchStyle({ opacity: v })} />
      
      <label className="flex items-center justify-between py-1.5 mt-2">
        <span className="text-[12px] text-on-surface-variant font-medium">Tło</span>
        <Switch checked={style.hasBackground ?? (style.backgroundOpacity > 0)} onChange={(v) => patchStyle({ hasBackground: v })} label="Tło" />
      </label>
      {(style.hasBackground ?? (style.backgroundOpacity > 0)) && (
        <div className="pl-2 border-l border-surface-variant/30 ml-1 mb-2">
          <ColorInput label="Kolor tła" value={style.background} onChange={(v) => patchStyle({ background: v })} />
          <ParamRow label="Krycie tła" value={style.backgroundOpacity} min={0} max={1} step={0.01} onChange={(v) => patchStyle({ backgroundOpacity: v })} />
        </div>
      )}

      <label className="flex items-center justify-between py-1.5 mt-2">
        <span className="text-[12px] text-on-surface-variant font-medium">Obrys</span>
        <Switch checked={style.hasStroke ?? (style.strokeWidth > 0)} onChange={(v) => patchStyle({ hasStroke: v })} label="Obrys" />
      </label>
      {(style.hasStroke ?? (style.strokeWidth > 0)) && (
        <div className="pl-2 border-l border-surface-variant/30 ml-1 mb-2">
          <ColorInput label="Kolor obrysu" value={style.strokeColor} onChange={(v) => patchStyle({ strokeColor: v })} />
          <ParamRow label="Grubość obrysu" unit="px" value={style.strokeWidth} min={0} max={12} step={0.5} onChange={(v) => patchStyle({ strokeWidth: v })} />
        </div>
      )}

      <label className="flex items-center justify-between py-1.5 mt-2">
        <span className="text-[12px] text-on-surface-variant font-medium">Cień</span>
        <Switch checked={style.shadow} onChange={(v) => patchStyle({ shadow: v })} label="Cień" />
      </label>
        {style.shadow && (
        <div className="pl-2 border-l border-surface-variant/30 ml-1 mb-2">
          <ParamRow label="Rozmycie cienia" unit="px" value={style.shadowBlur} min={0} max={60} step={1} precision={0} defaultValue={18} onChange={(v) => patchStyle({ shadowBlur: v })} />
        </div>
        )}
      </InspectorSection>

      {isSubtitle ? (
        <>
          <SectionHeader title="Czas i pozycja" icon="schedule" />
          <ParamRow label="Początek" unit="s" value={clip.start} min={0} max={Math.max(60, clip.start + 60)} step={0.05} onChange={(v) => update(clip.id, { start: Math.max(0, v) } as Partial<Clip>)} />
          <ParamRow label="Czas trwania" unit="s" value={clip.duration} min={0.2} max={30} step={0.05} onChange={(v) => update(clip.id, { duration: v } as Partial<Clip>)} />
          <ParamRow label="Pozycja pionowa" value={(clip as SubtitleClip).positionY} min={0.05} max={0.98} step={0.01} defaultValue={0.86} onChange={(v) => update(clip.id, { positionY: v } as Partial<Clip>)} />
        </>
      ) : (
        <>
          <SectionHeader title="Transform" icon="open_with" />
          <ParamRow label="Pozycja X" unit="%" value={(clip as TextClip).transform.x} min={-100} max={100} step={0.5} onChange={(v) => update(clip.id, { transform: { ...(clip as TextClip).transform, x: v } } as Partial<Clip>)} />
          <ParamRow label="Pozycja Y" unit="%" value={(clip as TextClip).transform.y} min={-100} max={100} step={0.5} onChange={(v) => update(clip.id, { transform: { ...(clip as TextClip).transform, y: v } } as Partial<Clip>)} />
          <ParamRow label="Skala" value={(clip as TextClip).transform.scale} min={0.1} max={4} step={0.01} defaultValue={1} onChange={(v) => update(clip.id, { transform: { ...(clip as TextClip).transform, scale: v } } as Partial<Clip>)} />
          <ParamRow label="Obrót" unit="°" value={(clip as TextClip).transform.rotation} min={-180} max={180} step={1} precision={0} onChange={(v) => update(clip.id, { transform: { ...(clip as TextClip).transform, rotation: v } } as Partial<Clip>)} />

          <SectionHeader title="Animacja" icon="animation" />
          <div className="flex flex-wrap gap-1.5 py-1">
            {(["none", "fade", "slideUp", "popIn", "typewriter"] as const).map((a) => (
              <Chip key={a} label={a} selected={(clip as TextClip).animation === a} onClick={() => update(clip.id, { animation: a } as Partial<Clip>)} />
            ))}
          </div>

          <SectionHeader title="Przejścia" icon="transition_fade" />
          <TransitionSection clip={clip} />

          <SectionHeader title="Efekty" icon="auto_fix_high" />
          <EffectsSection clip={clip as TextClip} />
        </>
      )}
    </div>
  );
}

function MarkersPanel() {
  const markers = useProjectStore((s) => s.project.markers);
  const updateMarker = useProjectStore((s) => s.updateMarker);
  const removeMarker = useProjectStore((s) => s.removeMarker);
  const addMarker = useProjectStore((s) => s.addMarker);
  if (!markers.length) {
    return (
      <EmptyState
        compact
        icon="bookmarks"
        title="Brak markerów"
        description="Dodaj marker klawiszem M lub przyciskiem poniżej."
        action={
          <Button variant="outlined" icon="bookmark_add" onClick={() => addMarker(playbackEngine.time)}>
            Dodaj marker
          </Button>
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-2 px-3 pb-4">
      {markers
        .slice()
        .sort((a, b) => a.time - b.time)
        .map((m) => (
          <div key={m.id} className="rounded-[12px] bg-surf p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={m.color}
                onChange={(e) => updateMarker(m.id, { color: e.target.value })}
                aria-label="Kolor markera"
                className="h-6 w-8 rounded-[6px] border border-outline-variant bg-transparent"
              />
              <input
                value={m.name}
                onChange={(e) => updateMarker(m.id, { name: e.target.value })}
                aria-label="Nazwa markera"
                className="flex-1 bg-transparent text-[12px] font-medium text-on-surface outline-none"
              />
              <button onClick={() => playbackEngine.seek(m.time)} className="font-mono text-[11px] text-primary">
                {formatTime(m.time, false)}
              </button>
              <IconButton icon="delete" label="Usuń marker" size={28} onClick={() => removeMarker(m.id)} />
            </div>
            <input
              value={m.note}
              placeholder="Notatka…"
              onChange={(e) => updateMarker(m.id, { note: e.target.value })}
              className="mt-1 w-full bg-transparent text-[11px] text-on-surface-variant outline-none"
            />
          </div>
        ))}
    </div>
  );
}

export function Inspector() {
  const selectedIds = useUiStore((s) => s.selectedClipIds);
  const clips = useProjectStore((s) => s.project.clips);
  const settings = useProjectStore((s) => s.project.settings);
  const openDialog = useUiStore((s) => s.openDialog);
  const renameLabel = useProjectStore((s) => s.updateClip);

  const clip = useMemo(() => clips.find((c) => c.id === selectedIds[0]), [clips, selectedIds]);

  return (
    <aside aria-label="Inspektor" className="flex h-full min-h-0 flex-col bg-surf-low">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Icon name="tune" size={18} className="text-on-surface-variant" />
        <h3 className="flex-1 truncate text-[14px] font-medium text-on-surface">
          {clip ? clip.label || "Klip" : "Inspektor"}
        </h3>
        {selectedIds.length > 1 && (
          <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[11px] text-on-secondary-container">
            {selectedIds.length} zaznaczone
          </span>
        )}
      </div>

      {!clip && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="px-3">
            <div className="rounded-[14px] bg-surf p-3">
              <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Projekt</p>
              <p className="pt-1 text-[13px] text-on-surface">
                {settings.width} × {settings.height} · {settings.fps} fps · {settings.aspectRatio}
              </p>
              <Button variant="outlined" icon="aspect_ratio" className="mt-2 w-full" onClick={() => openDialog("projectSettings")}>
                Ustawienia projektu
              </Button>
            </div>
          </div>
          <div className="px-3 pt-2">
            <SectionHeader title="Markery" icon="bookmarks" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MarkersPanel />
          </div>
          <div className="px-3 pb-4">
            <EmptyState
              compact
              icon="ads_click"
              title="Nie wybrano elementu"
              description="Kliknij klip na osi czasu, aby edytować jego parametry."
            />
          </div>
        </div>
      )}

      {clip && (
        <>
          <div className="px-3 pb-2">
            <TextField
              label="Etykieta"
              value={clip.label}
              onChange={(e) => renameLabel(clip.id, { label: e.target.value } as Partial<Clip>)}
            />
          </div>
          {clip.type === "video" && <VideoInspector clip={clip} />}
          {clip.type === "audio" && <AudioInspector clip={clip} />}
          {(clip.type === "text" || clip.type === "subtitle") && <TextInspector clip={clip} />}
          {clip.type === "shape" && <ShapeInspector clip={clip} />}
        </>
      )}
    </aside>
  );
}
