import { useEffect, useMemo, useState } from "react";
import type { ExportAudioCodec, ExportContainer, ExportEngineId, ExportVideoCodec } from "@/types";
import {
  Button,
  Chip,
  Dialog,
  Icon,
  LinearProgress,
  SectionHeader,
  SegmentedButtons,
  Select,
  Switch,
} from "@/components/ui";
import { useExportStore } from "@/stores/exportStore";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { EXPORT_PROFILES, FPS_OPTIONS, RESOLUTION_PRESETS, estimateFileSize, recommendedBitrate } from "@/services/export/profiles";
import { capabilities, findRecorderMime } from "@/services/export/capabilities";
import { deliverResult, runExport } from "@/services/export/exporter";
import { projectDuration } from "@/features/timeline/selectors";
import { serializeSrt } from "@/services/subtitles/parse";
import { formatBytes, formatTime, humanDuration, downloadBlob } from "@/utils/format";

export function ExportDialog() {
  const open = useUiStore((s) => s.dialog) === "export";
  const closeDialog = useUiStore((s) => s.closeDialog);
  const notify = useUiStore((s) => s.notify);
  const project = useProjectStore((s) => s.project);
  const backendUrl = useSettingsStore((s) => s.backendUrl);
  const store = useExportStore();
  const { settings, phase, ratio, message, elapsed, remaining, outcome, error } = store;

  const duration = projectDuration(project);
  const [customBitrate, setCustomBitrate] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (phase === "done" || phase === "error" || phase === "cancelled") return;
    store.patch({
      width: settings.width || project.settings.width,
      height: settings.height || project.settings.height,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const recommended = recommendedBitrate(settings.width, settings.height, settings.fps, settings.videoCodec, settings.quality);
  useEffect(() => {
    if (!customBitrate && settings.quality !== "custom" && settings.videoBitrate !== recommended) {
      store.patch({ videoBitrate: recommended });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommended, customBitrate, settings.quality]);

  const ffmpegWasmAvailable =
    typeof window !== "undefined" &&
    !window.location.hostname.includes("app.github.dev") &&
    !window.location.hostname.includes("github.dev");

  const mediaRecorderVideoOptions = settings.container === "webm"
    ? [
        { value: "vp8", label: "VP8" },
      ]
    : [
        { value: "h264", label: "H.264 / AVC" },
        { value: "h265", label: "H.265 / HEVC" },
      ];

  const mediaRecorderAudioOptions = settings.container === "webm"
    ? [
        { value: "opus", label: "Opus" },
        { value: "none", label: "Bez dźwięku" },
      ]
    : [
        { value: "aac", label: "AAC" },
        { value: "none", label: "Bez dźwięku" },
      ];

  const videoCodecOptions = settings.engine === "mediarecorder"
    ? mediaRecorderVideoOptions
    : [
        { value: "h264", label: "H.264 / AVC" },
        { value: "h265", label: "H.265 / HEVC" },
        { value: "vp9", label: "VP9" },
        { value: "vp8", label: "VP8" },
        { value: "av1", label: "AV1" },
      ];

  const audioCodecOptions = settings.engine === "mediarecorder"
    ? mediaRecorderAudioOptions
    : [
        { value: "aac", label: "AAC" },
        { value: "opus", label: "Opus" },
        { value: "vorbis", label: "Vorbis" },
        { value: "none", label: "Bez dźwięku" },
      ];

  const nativeMime = useMemo(
    () => findRecorderMime(settings.container, settings.videoCodec, settings.audioCodec),
    [settings.container, settings.videoCodec, settings.audioCodec],
  );
  const engineNote =
    settings.engine === "mediarecorder"
      ? nativeMime
        ? `Przeglądarka koduje natywnie: ${nativeMime}`

  const estimated = estimateFileSize(settings, duration);
  const running = phase === "preparing" || phase === "rendering" || phase === "transcoding" || phase === "finalizing";

  const start = async () => {
    const controller = new AbortController();
    store.begin(controller);
    try {
      const assets = new Map(project.assets.map((a) => [a.id, a]));
      const result = await runExport({
        project,
        assets,
        settings,
        backendUrl,
        signal: controller.signal,
        onProgress: (p, r, m) => store.progress(p, r, m),
      });
      const delivery = await deliverResult(result, settings.destination);
      store.finish({
        fileName: result.fileName,
        size: result.blob.size,
        mime: result.mime,
        blob: result.blob,
        savedVia: delivery.method,
      });
      if (delivery.note) notify({ text: delivery.note, tone: "error" });
      if (!settings.burnSubtitles) {
        const cues = project.clips
          .filter((c) => c.type === "subtitle")
          .map((c) => ({ id: c.id, start: c.start, end: c.start + c.duration, text: (c as { text: string }).text }));
        if (cues.length) {
          const srt = serializeSrt(cues);
          downloadBlob(new Blob([srt], { type: "application/x-subrip" }), result.fileName.replace(/\.[^.]+$/, ".srt"));
          notify("Napisy zapisano jako osobny plik .srt (sidecar).");
        }
      }
    } catch (err) {
      const e = err as Error;
      if (e.name === "AbortError") {
        store.cancel();
        return;
      }
      store.fail(e.message);
      notify({ text: `Eksport nie powiódł się: ${e.message}`, tone: "error", duration: 10000 });
    }
  };

  const applyProfile = (id: string) => {
    const profile = EXPORT_PROFILES.find((p) => p.id === id);
    if (!profile) return;
    store.patch({ profileId: id, ...profile.patch });
    setCustomBitrate(false);
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (running) return;
        closeDialog();
      }}
      title="Eksport filmu"
      icon="ios_share"
      size="lg"
      actions={
        running ? (
          <Button variant="outlined" icon="cancel" onClick={() => store.cancel()}>
            Anuluj
          </Button>
        ) : phase === "done" && outcome ? (
          <>
            <Button variant="text" onClick={() => store.reset()}>
              Eksportuj ponownie
            </Button>
            <Button icon="download" onClick={() => downloadBlob(outcome.blob, outcome.fileName)}>
              Pobierz plik
            </Button>
          </>
        ) : (
          <>
            <Button variant="text" onClick={closeDialog}>
              Zamknij
            </Button>
            <Button icon="rocket_launch" onClick={start} disabled={duration <= 0}>
              Rozpocznij eksport
            </Button>
          </>
        )
      }
    >
      {running || phase === "done" || phase === "error" || phase === "cancelled" ? (
        <div className="flex flex-col gap-4">
          <div className="rounded-[16px] bg-surf p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-container text-on-primary-container">
                <Icon
                  name={phase === "done" ? "check_circle" : phase === "error" ? "error" : phase === "cancelled" ? "cancel" : "movie_filter"}
                  size={24}
                  filled
                />
              </span>
              <div className="flex-1">
                <p className="text-[15px] font-medium text-on-surface">
                  {phase === "done"
                    ? "Eksport zakończony"
                    : phase === "error"
                      ? "Eksport nie powiódł się"
                      : phase === "cancelled"
                        ? "Eksport anulowany"
                        : message || "Przetwarzanie…"}
                </p>
                <p className="text-[12px] text-on-surface-variant">
                  {phase === "done" && outcome
                    ? `${outcome.fileName} · ${formatBytes(outcome.size)} · zapisano przez ${outcome.savedVia === "filesystem" ? "File System Access API" : "pobieranie"}`
                    : phase === "error"
                      ? error
                      : `Krok: ${phase} · ${Math.round(ratio * 100)}%`}
                </p>
              </div>
            </div>
            {running && (
              <>
                <LinearProgress value={ratio} className="mt-4" />
                <div className="mt-2 flex justify-between text-[11px] text-on-surface-variant">
                  <span>Czas: {humanDuration(elapsed)}</span>
                  <span>{remaining !== null ? `Pozostało ok. ${humanDuration(remaining)}` : "Szacowanie…"}</span>
                </div>
                <p className="mt-2 text-[11px] text-on-surface-variant">
                  Renderowanie odbywa się w czasie rzeczywistym — nie zamykaj i nie minimalizuj karty przeglądarki.
                </p>
              </>
            )}
          </div>
          {(phase === "error" || phase === "cancelled") && (
            <Button variant="tonal" icon="restart_alt" onClick={() => store.reset()}>
              Wróć do ustawień
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <SectionHeader title="Profil eksportu" icon="bookmark" />
          <div className="flex flex-wrap gap-1.5">
            {EXPORT_PROFILES.map((p) => (
              <Chip key={p.id} label={p.name} icon={p.icon} selected={settings.profileId === p.id} onClick={() => applyProfile(p.id)} />
            ))}
          </div>
          <p className="text-[11px] text-on-surface-variant">
            {EXPORT_PROFILES.find((p) => p.id === settings.profileId)?.description}
          </p>

          <SectionHeader title="Obraz" icon="video_settings" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Select
              label="Kontener"
              value={settings.container}
              options={[
                { value: "mp4", label: "MP4" },
                { value: "webm", label: "WebM" },
              ]}
              onChange={(v) => {
                const container = v as ExportContainer;
                const nextVideoCodec =
                  container === "mp4"
                    ? settings.engine === "mediarecorder"
                      ? "h264"
                      : settings.videoCodec === "vp9" || settings.videoCodec === "vp8" || settings.videoCodec === "av1"
                        ? "h264"
                        : settings.videoCodec
                    : settings.engine === "mediarecorder"
                      ? "vp8"
                      : settings.videoCodec === "h264" || settings.videoCodec === "h265"
                        ? "vp8"
                        : settings.videoCodec;
                const nextAudioCodec =
                  container === "mp4"
                    ? settings.engine === "mediarecorder"
                      ? "aac"
                      : settings.audioCodec === "opus" || settings.audioCodec === "vorbis"
                        ? "aac"
                        : settings.audioCodec
                    : settings.engine === "mediarecorder"
                      ? "opus"
                      : settings.audioCodec === "aac" || settings.audioCodec === "vorbis"
                        ? "opus"
                        : settings.audioCodec;
                store.patch({
                  container,
                  videoCodec: nextVideoCodec,
                  audioCodec: nextAudioCodec,
                  profileId: "custom",
                });
              }}
            />
            <Select
              label="Kodek wideo"
              value={settings.videoCodec}
              options={videoCodecOptions}
              onChange={(v) => {
                const videoCodec = v as ExportVideoCodec;
                const mp4Codec = videoCodec === "h264" || videoCodec === "h265";
                const nextContainer = settings.engine === "mediarecorder" ? (mp4Codec ? "mp4" : "webm") : mp4Codec ? "mp4" : "webm";
                store.patch({
                  videoCodec,
                  container: nextContainer,
                  audioCodec:
                    mp4Codec && !["aac", "none"].includes(settings.audioCodec)
                      ? "aac"
                      : !mp4Codec && settings.audioCodec === "aac"
                        ? "opus"
                        : settings.audioCodec,
                  profileId: "custom",
                });
              }}
            />
            <Select
              label="Klatki na sekundę"
              value={String(settings.fps)}
              options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))}
              onChange={(v) => store.patch({ fps: Number(v), profileId: "custom" })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              label={`Źródło (${project.settings.width}×${project.settings.height})`}
              selected={settings.width === project.settings.width && settings.height === project.settings.height}
              onClick={() => store.patch({ width: project.settings.width, height: project.settings.height, profileId: "custom" })}
            />
            {RESOLUTION_PRESETS.map((r) => {
              const portrait = project.settings.height > project.settings.width;
              const w = portrait ? r.height : r.width;
              const h = portrait ? r.width : r.height;
              return (
                <Chip
                  key={r.label}
                  label={r.label}
                  selected={settings.width === w && settings.height === h}
                  onClick={() => store.patch({ width: w, height: h, profileId: "custom" })}
                />
              );
            })}
          </div>

          <SectionHeader title="Jakość" icon="high_quality" />
          <SegmentedButtons
            value={settings.quality}
            onChange={(v) => {
              store.patch({ quality: v, profileId: "custom" });
              setCustomBitrate(v === "custom");
            }}
            options={[
              { value: "low", label: "Niska" },
              { value: "medium", label: "Średnia" },
              { value: "high", label: "Wysoka" },
              { value: "veryhigh", label: "Bardzo wysoka" },
              { value: "custom", label: "Własna" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[11px] text-on-surface-variant">
              Bitrate wideo (kb/s)
              <input
                type="number"
                value={settings.videoBitrate}
                min={200}
                max={200000}
                onChange={(e) => {
                  setCustomBitrate(true);
                  store.patch({ videoBitrate: Number(e.target.value), quality: "custom" });
                }}
                className="mt-1 h-10 w-full rounded-[10px] bg-surf-high px-3 font-mono text-[13px] text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="text-[11px] text-on-surface-variant">
              Bitrate audio (kb/s)
              <input
                type="number"
                value={settings.audioBitrate}
                min={32}
                max={512}
                onChange={(e) => store.patch({ audioBitrate: Number(e.target.value) })}
                className="mt-1 h-10 w-full rounded-[10px] bg-surf-high px-3 font-mono text-[13px] text-on-surface outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
          </div>

          <SectionHeader title="Dźwięk" icon="graphic_eq" />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Kodek audio"
              value={settings.audioCodec}
              options={audioCodecOptions}
              onChange={(v) => store.patch({ audioCodec: v as ExportAudioCodec })}
            />
            <Select
              label="Częstotliwość próbkowania"
              value={String(settings.sampleRate)}
              options={[
                { value: "44100", label: "44,1 kHz" },
                { value: "48000", label: "48 kHz" },
              ]}
              onChange={(v) => store.patch({ sampleRate: Number(v) })}
            />
          </div>

          <SectionHeader title="Silnik i miejsce zapisu" icon="memory" />
          <SegmentedButtons
            value={settings.engine}
            onChange={(v) => store.patch({ engine: v as ExportEngineId })}
            options={[
              { value: "mediarecorder", label: "Przeglądarka", icon: "speed" },
<<<<<<< HEAD
              ...(ffmpegWasmAvailable
                ? [{ value: "ffmpeg-wasm", label: "FFmpeg WASM", icon: "memory" } as const]
                : []),
=======
>>>>>>> origin/main
              { value: "backend", label: "Backend", icon: "dns" },
            ]}
          />
          {!ffmpegWasmAvailable && (
            <p className="text-[11px] text-warning">
              FFmpeg WASM jest wyłączone w tym środowisku, ponieważ przeglądarka blokuje zewnętrzne worker-y. Użyj silnika "Przeglądarka" lub podłącz backend.
            </p>
          )}
          <p className="text-[11px] text-on-surface-variant">{engineNote}</p>
          <SegmentedButtons
            value={settings.destination}
            onChange={(v) => store.patch({ destination: v })}
            options={[
              { value: "download", label: "Pobierz", icon: "download" },
              { value: "filesystem", label: "Wybierz lokalizację", icon: "folder_open" },
            ]}
          />
          {settings.destination === "filesystem" && !capabilities.fileSystemAccess && (
            <p className="text-[11px] text-error">
              File System Access API nie jest dostępne w tej przeglądarce — plik zostanie pobrany standardowo.
            </p>
          )}
          <label className="flex items-center justify-between rounded-[12px] bg-surf p-3">
            <span className="text-[12px] text-on-surface">Wypal napisy w obrazie</span>
            <Switch checked={settings.burnSubtitles} onChange={(v) => store.patch({ burnSubtitles: v })} label="Wypal napisy" />
          </label>

          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-[16px] bg-surf p-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Podsumowanie</p>
              <p className="text-[13px] text-on-surface">
                {settings.width}×{settings.height} · {settings.fps} fps · {settings.videoCodec.toUpperCase()} ·{" "}
                {formatTime(duration, false)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">Szacowany rozmiar</p>
              <p className="text-[15px] font-medium text-on-surface">{formatBytes(estimated)}</p>
            </div>
          </div>
          {duration <= 0 && (
            <p className="text-[11px] text-error">Oś czasu jest pusta — dodaj materiał, aby włączyć eksport.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
