import type { ExportSettings } from "@/types";

/* ------------------------------------------------------------------
 * FFmpeg abstraction.
 *
 * Two concrete implementations ship with the app:
 *   • WasmFFmpeg    – @ffmpeg/ffmpeg (WebAssembly) loaded on demand from a
 *                     CDN. Single-threaded core, works without COOP/COEP.
 *   • BackendFFmpeg – thin HTTP client for a native FFmpeg service. The
 *                     contract is documented below so a server can be
 *                     plugged in without touching the UI layer.
 *
 * Nothing here simulates FFmpeg: when an engine is unavailable the caller
 * receives a descriptive error and the UI surfaces it.
 * ------------------------------------------------------------------ */

export interface TranscodeRequest {
  input: Blob;
  inputName: string;
  outputName: string;
  settings: ExportSettings;
  /** extra raw ffmpeg args placed before the output file */
  extraArgs?: string[];
  onProgress?: (ratio: number, message: string) => void;
  signal?: AbortSignal;
}

export interface FFmpegEngine {
  readonly id: "ffmpeg-wasm" | "backend";
  readonly name: string;
  isAvailable(): Promise<boolean>;
  load(onProgress?: (ratio: number, message: string) => void): Promise<void>;
  transcode(req: TranscodeRequest): Promise<Blob>;
  terminate(): void;
}

export function buildFFmpegArgs(s: ExportSettings, inputName: string, outputName: string): string[] {
  const args = ["-i", inputName];
  const vcodec =
    s.videoCodec === "h264"
      ? "libx264"
      : s.videoCodec === "h265"
        ? "libx265"
        : s.videoCodec === "vp9"
          ? "libvpx-vp9"
          : s.videoCodec === "vp8"
            ? "libvpx"
            : "libaom-av1";
  args.push("-c:v", vcodec);
  args.push("-b:v", `${s.videoBitrate}k`);
  args.push("-r", String(s.fps));
  args.push("-vf", `scale=${s.width}:${s.height}:flags=bicubic`);
  if (s.videoCodec === "h264" || s.videoCodec === "h265") {
    args.push("-preset", "veryfast", "-pix_fmt", "yuv420p");
    if (s.container === "mp4") args.push("-movflags", "+faststart");
  }
  if (s.audioCodec === "none") {
    args.push("-an");
  } else {
    const acodec = s.audioCodec === "aac" ? "aac" : s.audioCodec === "opus" ? "libopus" : "libvorbis";
    args.push("-c:a", acodec, "-b:a", `${s.audioBitrate}k`, "-ar", String(s.sampleRate));
  }
  args.push("-y", outputName);
  return args;
}

/* --------------------------- WASM engine --------------------------- */

const FFMPEG_VERSION = "0.12.10";
const CORE_VERSION = "0.12.6";
const ESM_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`;
const WORKER_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`;
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

async function toBlobURL(url: string, mime: string, onProgress?: (r: number) => void): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Nie udało się pobrać ${url} (HTTP ${res.status}).`);
  const total = Number(res.headers.get("content-length") ?? 0);
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mime }));
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded / total);
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mime }));
}

interface FFmpegInstance {
  load(opts: Record<string, string>): Promise<boolean>;
  writeFile(name: string, data: Uint8Array): Promise<boolean>;
  readFile(name: string): Promise<Uint8Array | string>;
  deleteFile(name: string): Promise<boolean>;
  exec(args: string[]): Promise<number>;
  terminate(): void;
  on(event: string, cb: (data: never) => void): void;
}

export class WasmFFmpeg implements FFmpegEngine {
  readonly id = "ffmpeg-wasm" as const;
  readonly name = "FFmpeg WebAssembly";
  private instance: FFmpegInstance | null = null;
  private loading: Promise<void> | null = null;
  private durationHint = 0;
  private progressCb: ((ratio: number, message: string) => void) | null = null;

  async isAvailable(): Promise<boolean> {
    return typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
  }

  async load(onProgress?: (ratio: number, message: string) => void): Promise<void> {
    if (this.instance) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      onProgress?.(0.02, "Pobieranie modułu FFmpeg…");
      const mod = (await import(/* @vite-ignore */ ESM_URL)) as {
        FFmpeg: new () => FFmpegInstance;
      };
      const classWorkerURL = await toBlobURL(WORKER_URL, "text/javascript");
      const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript", (r) =>
        onProgress?.(0.05 + r * 0.15, "Pobieranie rdzenia FFmpeg…"),
      );
      const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm", (r) =>
        onProgress?.(0.2 + r * 0.6, "Pobieranie ffmpeg-core.wasm…"),
      );
      const ff = new mod.FFmpeg();
      ff.on("log", () => undefined);
      ff.on("progress", (data: never) => {
        const p = data as unknown as { progress: number; time: number };
        const ratio = this.durationHint > 0 ? Math.min(1, p.time / 1_000_000 / this.durationHint) : p.progress;
        if (isFinite(ratio) && ratio >= 0) this.progressCb?.(Math.min(0.999, ratio), "Transkodowanie FFmpeg…");
      });
      onProgress?.(0.85, "Inicjalizacja rdzenia…");
      await ff.load({ coreURL, wasmURL, classWorkerURL });
      this.instance = ff;
      onProgress?.(1, "FFmpeg gotowy");
    })();
    try {
      await this.loading;
    } catch (err) {
      this.loading = null;
      throw new Error(
        `Inicjalizacja FFmpeg WebAssembly nie powiodła się: ${(err as Error).message}. ` +
          `Sprawdź połączenie sieciowe lub użyj silnika przeglądarkowego.`,
      );
    }
  }

  async transcode(req: TranscodeRequest): Promise<Blob> {
    await this.load((r, m) => req.onProgress?.(r * 0.4, m));
    const ff = this.instance;
    if (!ff) throw new Error("FFmpeg nie został zainicjalizowany.");
    this.progressCb = (r, m) => req.onProgress?.(r, m);
    const bytes = new Uint8Array(await req.input.arrayBuffer());
    await ff.writeFile(req.inputName, bytes);
    const args = req.extraArgs ?? buildFFmpegArgs(req.settings, req.inputName, req.outputName);
    const code = await ff.exec(args);
    if (code !== 0) {
      throw new Error(
        `FFmpeg zakończył się kodem ${code}. Wybrany kodek może nie być dostępny w rdzeniu WebAssembly ` +
          `(np. libx265/libaom wymagają natywnego backendu).`,
      );
    }
    const data = await ff.readFile(req.outputName);
    await ff.deleteFile(req.inputName).catch(() => undefined);
    await ff.deleteFile(req.outputName).catch(() => undefined);
    this.progressCb = null;
    const bin = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const mime = req.settings.container === "mp4" ? "video/mp4" : "video/webm";
    return new Blob([bin as BlobPart], { type: mime });
  }

  setDurationHint(seconds: number): void {
    this.durationHint = seconds;
  }

  terminate(): void {
    this.instance?.terminate();
    this.instance = null;
    this.loading = null;
  }
}

/* -------------------------- backend engine -------------------------- */

/**
 * Contract expected from a native FFmpeg service:
 *   POST {baseUrl}/transcode   multipart/form-data
 *        file     – intermediate media produced by the browser
 *        settings – JSON ExportSettings
 *        args     – JSON string[] (ffmpeg argv, without binary name)
 *   → 200 with the encoded file as the response body.
 *   GET  {baseUrl}/health → 200 when the service is reachable.
 */
export class BackendFFmpeg implements FFmpegEngine {
  readonly id = "backend" as const;
  readonly name = "Natywny FFmpeg (backend)";
  constructor(private baseUrl: string) {}

  async isAvailable(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async load(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error(
        "Nie skonfigurowano adresu backendu FFmpeg. Podaj go w Ustawieniach → Silnik renderowania.",
      );
    }
    if (!(await this.isAvailable())) {
      throw new Error(`Backend FFmpeg (${this.baseUrl}) jest niedostępny.`);
    }
  }

  async transcode(req: TranscodeRequest): Promise<Blob> {
    await this.load();
    const form = new FormData();
    form.append("file", req.input, req.inputName);
    form.append("settings", JSON.stringify(req.settings));
    form.append("args", JSON.stringify(req.extraArgs ?? buildFFmpegArgs(req.settings, req.inputName, req.outputName)));
    req.onProgress?.(0.1, "Wysyłanie materiału do backendu…");
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/transcode`, {
      method: "POST",
      body: form,
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`Backend zwrócił błąd HTTP ${res.status}.`);
    req.onProgress?.(0.9, "Pobieranie wyniku…");
    return await res.blob();
  }

  terminate(): void {
    /* stateless HTTP client */
  }
}

let wasmSingleton: WasmFFmpeg | null = null;

export function getWasmFFmpeg(): WasmFFmpeg {
  if (!wasmSingleton) wasmSingleton = new WasmFFmpeg();
  return wasmSingleton;
}
