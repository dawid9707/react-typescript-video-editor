import { useEffect, useState } from "react";
import type { AspectRatioPreset, ThemeMode } from "@/types";
import { Button, Chip, Dialog, Icon, SectionHeader, SegmentedButtons, Select, Switch, TextField } from "@/components/ui";
import { useSettingsStore } from "@/stores/settingsStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { ACCENT_PRESETS } from "@/theme/palette";
import { capabilities } from "@/services/export/capabilities";
import { storageEstimate } from "@/services/project/db";
import { PROJECT_RESOLUTION_PRESETS, FPS_OPTIONS } from "@/services/export/profiles";
import { formatBytes } from "@/utils/format";
import { cn } from "@/utils/cn";

function CapabilityRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <Icon name={ok ? "check_circle" : "cancel"} size={16} className={ok ? "text-primary" : "text-error"} filled />
      <div>
        <p className="text-[12px] text-on-surface">{label}</p>
        {hint && <p className="text-[11px] text-on-surface-variant">{hint}</p>}
      </div>
    </div>
  );
}

export function SettingsDialog() {
  const open = useUiStore((s) => s.dialog) === "settings";
  const close = useUiStore((s) => s.closeDialog);
  const s = useSettingsStore();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    if (open) void storageEstimate().then(setStorage);
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Ustawienia aplikacji"
      icon="settings"
      size="lg"
      actions={
        <>
          <Button variant="text" onClick={() => s.reset()}>
            Przywróć domyślne
          </Button>
          <Button onClick={close}>Gotowe</Button>
        </>
      }
    >
      <SectionHeader title="Wygląd" icon="palette" />
      <SegmentedButtons
        className="w-full"
        value={s.theme}
        onChange={(v) => s.set("theme", v as ThemeMode)}
        options={[
          { value: "system", label: "System", icon: "brightness_auto" },
          { value: "light", label: "Jasny", icon: "light_mode" },
          { value: "dark", label: "Ciemny", icon: "dark_mode" },
          { value: "amoled", label: "AMOLED", icon: "contrast" },
        ]}
      />
      <p className="pt-3 text-[12px] text-on-surface-variant">Kolor akcentu (dynamic color)</p>
      <div className="flex flex-wrap gap-2 pt-2">
        {ACCENT_PRESETS.map((a) => (
          <button
            key={a.value}
            onClick={() => s.set("accent", a.value)}
            aria-label={a.name}
            title={a.name}
            className={cn(
              "h-9 w-9 rounded-full transition-transform hover:scale-110",
              s.accent === a.value && "ring-2 ring-offset-2 ring-primary ring-offset-[var(--md-surface-container-high)]",
            )}
            style={{ background: a.value }}
          />
        ))}
        <label className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-outline-variant">
          <Icon name="colorize" size={16} className="text-on-surface-variant" />
          <input
            type="color"
            value={s.accent}
            onChange={(e) => s.set("accent", e.target.value)}
            className="h-0 w-0 opacity-0"
            aria-label="Własny kolor akcentu"
          />
        </label>
      </div>

      <SectionHeader title="Edycja" icon="edit" />
      <label className="flex items-center justify-between py-2">
        <span className="text-[13px] text-on-surface">Przyciąganie (snapping)</span>
        <Switch checked={s.snapping} onChange={(v) => s.set("snapping", v)} label="Snapping" />
      </label>
      <label className="flex items-center justify-between py-2">
        <span className="text-[13px] text-on-surface">Automatyczny zapis projektu</span>
        <Switch checked={s.autoSave} onChange={(v) => s.set("autoSave", v)} label="Autozapis" />
      </label>
      <label className="flex items-center justify-between py-2">
        <span className="text-[13px] text-on-surface">Rysuj przebiegi audio</span>
        <Switch checked={s.showWaveforms} onChange={(v) => s.set("showWaveforms", v)} label="Waveform" />
      </label>

      <SectionHeader title="Silnik renderowania" icon="memory" />
      <TextField
        label="Adres backendu z natywnym FFmpeg (opcjonalnie)"
        placeholder="https://moj-serwer.example/api/ffmpeg"
        value={s.backendUrl}
        onChange={(e) => s.set("backendUrl", e.target.value)}
      />
      <p className="pt-1 text-[11px] text-on-surface-variant">
        Oczekiwany kontrakt: <code>GET /health</code> oraz <code>POST /transcode</code> (multipart: file, settings, args)
        zwracające zakodowany plik.
      </p>

      <SectionHeader title="Możliwości przeglądarki" icon="verified" />
      <CapabilityRow ok={capabilities.mediaRecorder} label="MediaRecorder" hint="Nagrywanie osi czasu w czasie rzeczywistym" />
      <CapabilityRow ok={capabilities.captureStream} label="canvas.captureStream" hint="Przechwytywanie kompozycji wideo" />
      <CapabilityRow ok={capabilities.webCodecs} label="WebCodecs" hint="Sprzętowe kodowanie/dekodowanie klatek" />
      <CapabilityRow ok={capabilities.offscreenCanvas} label="OffscreenCanvas" hint="Renderowanie poza wątkiem głównym" />
      <CapabilityRow ok={capabilities.fileSystemAccess} label="File System Access API" hint="Zapis bezpośrednio na dysk" />
      <CapabilityRow
        ok={capabilities.crossOriginIsolated}
        label="crossOriginIsolated (SharedArrayBuffer)"
        hint="Wymagane przez wielowątkowy rdzeń ffmpeg.wasm — bez tego używany jest rdzeń jednowątkowy"
      />
      <p className="pt-2 text-[11px] text-on-surface-variant">
        Obsługiwane formaty nagrywania: {capabilities.recorderMimeTypes.join(", ") || "brak"}
      </p>
      {storage && (
        <p className="pt-2 text-[11px] text-on-surface-variant">
          Pamięć przeglądarki: {formatBytes(storage.usage)} z {formatBytes(storage.quota)}
        </p>
      )}
    </Dialog>
  );
}

export function ProjectSettingsDialog() {
  const open = useUiStore((s) => s.dialog) === "projectSettings";
  const close = useUiStore((s) => s.closeDialog);
  const settings = useProjectStore((s) => s.project.settings);
  const update = useProjectStore((s) => s.updateSettings);

  const ratios: AspectRatioPreset[] = ["16:9", "9:16", "1:1", "4:3", "4:5", "21:9", "custom"];

  const applyRatio = (ratio: AspectRatioPreset) => {
    const map: Record<string, [number, number]> = {
      "16:9": [1920, 1080],
      "9:16": [1080, 1920],
      "1:1": [1080, 1080],
      "4:3": [1440, 1080],
      "4:5": [1080, 1350],
      "21:9": [2560, 1080],
    };
    const dims = map[ratio];
    if (dims) update({ aspectRatio: ratio, width: dims[0], height: dims[1] });
    else update({ aspectRatio: ratio });
  };

  return (
    <Dialog open={open} onClose={close} title="Ustawienia projektu" icon="aspect_ratio" size="md" actions={<Button onClick={close}>Gotowe</Button>}>
      <SectionHeader title="Proporcje" icon="crop" />
      <div className="flex flex-wrap gap-1.5">
        {ratios.map((r) => (
          <Chip key={r} label={r} selected={settings.aspectRatio === r} onClick={() => applyRatio(r)} />
        ))}
      </div>

      <SectionHeader title="Rozdzielczość" icon="hd" />
      <div className="flex flex-wrap gap-1.5">
        {PROJECT_RESOLUTION_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={p.label}
            selected={settings.width === p.width && settings.height === p.height}
            onClick={() => update({ width: p.width, height: p.height, aspectRatio: p.aspect })}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 pt-3">
        <TextField
          label="Szerokość (px)"
          type="number"
          value={settings.width}
          onChange={(e) => update({ width: Math.max(16, Number(e.target.value)), aspectRatio: "custom" })}
        />
        <TextField
          label="Wysokość (px)"
          type="number"
          value={settings.height}
          onChange={(e) => update({ height: Math.max(16, Number(e.target.value)), aspectRatio: "custom" })}
        />
      </div>

      <SectionHeader title="Czas i dźwięk" icon="schedule" />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Klatki na sekundę"
          value={String(settings.fps)}
          options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))}
          onChange={(v) => update({ fps: Number(v) })}
        />
        <Select
          label="Próbkowanie audio"
          value={String(settings.sampleRate)}
          options={[
            { value: "44100", label: "44,1 kHz" },
            { value: "48000", label: "48 kHz" },
          ]}
          onChange={(v) => update({ sampleRate: Number(v) })}
        />
      </div>
      <div className="pt-3">
        <label className="flex items-center justify-between rounded-[12px] bg-surf p-3">
          <span className="text-[12px] text-on-surface">Kolor tła kompozycji</span>
          <input
            type="color"
            value={settings.backgroundColor}
            onChange={(e) => update({ backgroundColor: e.target.value })}
            aria-label="Kolor tła"
            className="h-8 w-12 rounded-[6px] border border-outline-variant bg-transparent"
          />
        </label>
      </div>
    </Dialog>
  );
}
