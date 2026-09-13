import type { ExportPhase, ExportSettings, MediaAsset, Project } from "@/types";
import { playbackEngine } from "@/services/playback/engine";
import { bestIntermediateMime, capabilities, exportFormat, findRecorderMime } from "@/services/export/capabilities";
import { BackendFFmpeg, type FFmpegEngine } from "@/services/ffmpeg";
import { projectDuration } from "@/features/timeline/selectors";
import { downloadBlob } from "@/utils/format";
import fixWebmDuration from "webm-duration-fix";

export interface ExportRequest {
  project: Project;
  assets: Map<string, MediaAsset>;
  settings: ExportSettings;
  backendUrl: string;
  onProgress: (phase: ExportPhase, ratio: number, message: string) => void;
  signal: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  fileName: string;
  mime: string;
  durationSec: number;
}

function sanitize(name: string): string {
  return name.replace(/[^\p{L}\p{N}\-_ ]/gu, "").trim() || "eksport";
}

async function repairWebmDuration(blob: Blob, onProgress: () => void): Promise<Blob> {
  onProgress();
  try {
    const repaired = await fixWebmDuration(blob);
    if (!repaired.size) throw new Error("Naprawiony plik WebM jest pusty.");
    return repaired;
  } catch (err) {
    console.warn("Nie udało się naprawić czasu trwania WebM:", err);
    return blob;
  }
}

/**
 * Renders the timeline into a canvas in real time and captures it with
 * MediaRecorder (hardware accelerated in every modern browser).
 * The audio graph of the playback engine is routed into the same stream.
 */
async function recordTimeline(req: ExportRequest, mime: string): Promise<Blob> {
  const { project, assets, settings } = req;
  const canvas = document.createElement("canvas");
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Nie udało się utworzyć kontekstu 2D dla renderera.");

  const start = settings.rangeStart ?? 0;
  const end = settings.rangeEnd ?? projectDuration(project);
  const span = Math.max(0.1, end - start);

  playbackEngine.setProject(project, assets);
  const wasPlaying = playbackEngine.playing;
  const restoreTime = playbackEngine.time;
  const restoreRate = playbackEngine.rate;
  playbackEngine.pause();
  playbackEngine.setRate(1);
  playbackEngine.addTarget({
    id: "export",
    canvas,
    width: settings.width,
    height: settings.height,
    highQuality: true,
    showSubtitles: settings.burnSubtitles,
  });

  const stream = canvas.captureStream(settings.fps);
  if (settings.audioCodec !== "none") {
    const audioStream = playbackEngine.recordingStream();
    for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: settings.videoBitrate * 1000,
    audioBitsPerSecond: settings.audioBitrate * 1000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("MediaRecorder zgłosił błąd podczas nagrywania."));
  });

  await playbackEngine.prepareFrame(start);
  playbackEngine.paint();
  recorder.start(500);
  await playbackEngine.play();

  await new Promise<void>((resolve) => {
    const tick = () => {
      if (req.signal.aborted) {
        resolve();
        return;
      }
      const t = playbackEngine.time;
      const ratio = Math.min(1, Math.max(0, (t - start) / span));
      req.onProgress("rendering", ratio, `Renderowanie klatek · ${Math.round(ratio * 100)}%`);
      if (t >= end - 0.001 || !playbackEngine.playing) {
        resolve();
        return;
      }
      window.setTimeout(tick, 120);
    };
    tick();
  });

  playbackEngine.pause();
  if (recorder.state !== "inactive") recorder.stop();
  const blob = await finished;
  playbackEngine.removeTarget("export");
  playbackEngine.setRate(restoreRate);
  playbackEngine.seek(restoreTime);
  if (wasPlaying) void playbackEngine.play();
  if (req.signal.aborted) throw new DOMException("Eksport anulowany", "AbortError");
  if (!blob.size) throw new Error("Nagranie jest puste — sprawdź czy oś czasu zawiera materiał.");
  return blob;
}

export async function runExport(req: ExportRequest): Promise<ExportResult> {
  const { settings, project } = req;
  const duration = Math.max(
    0.1,
    (settings.rangeEnd ?? projectDuration(project)) - (settings.rangeStart ?? 0),
  );
  if (projectDuration(project) <= 0) {
    throw new Error("Oś czasu jest pusta — dodaj przynajmniej jeden klip przed eksportem.");
  }
  if (!capabilities.mediaRecorder || !capabilities.captureStream) {
    throw new Error(
      "Ta przeglądarka nie obsługuje MediaRecorder / canvas.captureStream. Użyj Chrome, Edge lub Firefox w wersji desktopowej.",
    );
  }

  req.onProgress("preparing", 0.02, "Przygotowywanie renderera…");

  if (settings.engine === "mediarecorder") {
    let mime = findRecorderMime(settings.container, settings.videoCodec, settings.audioCodec);
    if (!mime) {
      mime = bestIntermediateMime() || 'video/webm;codecs="vp8,opus"';
    }
    let blob = await recordTimeline(req, mime);
    if (settings.container === "webm" || mime.includes("webm")) {
      blob = await repairWebmDuration(blob, () =>
        req.onProgress("preparing", 0.95, "Naprawianie metadanych WebM…"),
      );
    }
    req.onProgress("finalizing", 0.98, "Finalizowanie pliku…");
    const actualContainer = mime.includes("mp4") ? "mp4" : "webm";
    const format = exportFormat(actualContainer);
    return { blob, fileName: `${sanitize(project.name)}.${format.extension}`, mime, durationSec: duration };
  }

  const intermediate = bestIntermediateMime();
  if (!intermediate) throw new Error("Brak obsługiwanego formatu pośredniego dla MediaRecorder.");
  const raw = await recordTimeline(req, intermediate);

  const engine: FFmpegEngine = new BackendFFmpeg(req.backendUrl);

  req.onProgress("transcoding", 0.02, `Inicjalizacja: ${engine.name}…`);
  const inExt = intermediate.includes("mp4") ? "mp4" : "webm";
  const format = exportFormat(settings.container);
  let blob = await engine.transcode({
    input: raw,
    inputName: `input.${inExt}`,
    outputName: `output.${format.extension}`,
    settings,
    signal: req.signal,
    onProgress: (ratio, message) => req.onProgress("transcoding", ratio, message),
  });
  if (format.extension === "webm") {
    blob = await repairWebmDuration(blob, () =>
      req.onProgress("finalizing", 0.95, "Naprawianie metadanych WebM…"),
    );
  }
  req.onProgress("finalizing", 0.98, "Finalizowanie pliku…");
  return {
    blob,
    fileName: `${sanitize(project.name)}.${format.extension}`,
    mime: format.mime,
    durationSec: duration,
  };
}

/* --------------------------- destinations --------------------------- */

export interface DeliveryResult {
  method: "filesystem" | "download";
  note?: string;
}

export async function deliverResult(
  result: ExportResult,
  destination: ExportSettings["destination"],
): Promise<DeliveryResult> {
  if (destination === "filesystem" && capabilities.fileSystemAccess) {
    const picker = (
      window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<{
          createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
        }>;
      }
    ).showSaveFilePicker;
    const extension = result.fileName.slice(result.fileName.lastIndexOf("."));
    const handle = await picker({
      suggestedName: result.fileName,
      types: [
        {
          description:
            result.mime === "video/mp4"
              ? "Wideo MP4"
              : result.mime === "video/webm"
                ? "Wideo WebM"
                : result.mime === "video/x-matroska"
                  ? "Wideo Matroska"
                  : "Animacja GIF",
          accept: { [result.mime]: [extension] },
        },
      ],
    });
    const writable = await handle.createWritable();
    await writable.write(result.blob);
    await writable.close();
    return { method: "filesystem" };
  }
  downloadBlob(result.blob, result.fileName);
  return {
    method: "download",
    note:
      destination === "filesystem"
        ? "File System Access API nie jest dostępne w tej przeglądarce — użyto standardowego pobierania."
        : undefined,
  };
}
