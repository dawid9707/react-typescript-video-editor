import type { ExportSettings } from "@/types";

/* ------------------------------------------------------------------
 * FFmpeg abstraction.
 *
 * Two concrete implementations ship with the app:
 *   • WasmFFmpeg    – @ffmpeg/ffmpeg (WebAssembly) loaded on demand from a
 *                     CDN. Uses the multi-threaded core when the page is
 *                     cross-origin isolated, otherwise falls back to single-threaded.
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

function virtualFileName(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file.bin";
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe || "file.bin";
}

async function startsWithEbml(blob: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export function buildFFmpegArgs(s: ExportSettings, inputName: string, outputName: string): string[] {
  const args = ["-fflags", "+genpts", "-i", inputName, "-map", "0:v:0"];
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
  if (s.container === "gif") {
    args.push("-an", "-vf", `fps=${s.fps},scale=${s.width}:${s.height}:flags=bicubic`, "-c:v", "gif", "-f", "gif");
    args.push("-y", outputName);
    return args;
  }
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
    args.push("-map", "0:a:0?");
    const acodec = s.audioCodec === "aac" ? "aac" : s.audioCodec === "opus" ? "libopus" : "libvorbis";
    args.push("-c:a", acodec, "-b:a", `${s.audioBitrate}k`, "-ar", String(s.sampleRate));
  }
  args.push("-shortest", "-avoid_negative_ts", "make_zero");
  args.push("-f", s.container === "mp4" ? "mp4" : s.container === "mkv" ? "matroska" : "webm", "-y", outputName);
  return args;
}

/* --------------------------- WASM engine --------------------------- */

const FFMPEG_VERSION = "0.12.10";
const CORE_VERSION = "0.12.6";
const ESM_URL = `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/index.js`;
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;
const CORE_MT_BASE = `https://unpkg.com/@ffmpeg/core-mt@${CORE_VERSION}/dist/esm`;

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

interface FFmpegLoadOptions {
  coreURL: string;
  wasmURL: string;
  classWorkerURL: string;
  workerURL?: string;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

interface FFmpegInstance {
  load(opts: FFmpegLoadOptions): Promise<boolean>;
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

  private isBlockedRemoteWorkerEnvironment(): boolean {
    const host = typeof location !== "undefined" ? location.hostname : "";
    return host.includes("app.github.dev") || host.includes("github.dev");
  }

  private canUseThreads(): boolean {
    return typeof SharedArrayBuffer !== "undefined" &&
      typeof crossOriginIsolated !== "undefined" &&
      crossOriginIsolated;
  }

  async isAvailable(): Promise<boolean> {
    if (this.isBlockedRemoteWorkerEnvironment()) return false;
    return typeof WebAssembly !== "undefined" && typeof Worker !== "undefined";
  }

  async load(onProgress?: (ratio: number, message: string) => void): Promise<void> {
    if (this.isBlockedRemoteWorkerEnvironment()) {
      throw new Error(
        "FFmpeg WASM jest zablokowany w tym środowisku (GitHub Codespaces / app.github.dev), bo przeglądarka odrzuca zewnętrzne worker-y. Użyj 'Przeglądarka' albo skonfiguruj backend FFmpeg.",
      );
    }
    if (this.instance) return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      onProgress?.(0.02, "Pobieranie modułu FFmpeg…");
      const mod = (await import(/* @vite-ignore */ ESM_URL)) as {
        FFmpeg: new () => FFmpegInstance;
      };
      const classWorkerURL = await toBlobURL(
        `https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/esm/worker.js`,
        "text/javascript",
      );
      const threaded = this.canUseThreads();
      const coreBase = threaded ? CORE_MT_BASE : CORE_BASE;
      const coreLabel = threaded ? "wielowątkowego rdzenia FFmpeg" : "rdzenia FFmpeg";
      const coreURL = await toBlobURL(`${coreBase}/ffmpeg-core.js`, "text/javascript", (r) =>
        onProgress?.(0.05 + r * 0.15, `Pobieranie ${coreLabel}…`),
      );
      const wasmURL = await toBlobURL(`${coreBase}/ffmpeg-core.wasm`, "application/wasm", (r) =>
        onProgress?.(0.2 + r * 0.6, `Pobieranie ${coreLabel}.wasm…`),
      );
      const workerURL = threaded
        ? await toBlobURL(`${CORE_MT_BASE}/ffmpeg-core.worker.js`, "text/javascript", (r) =>
            onProgress?.(0.8 + r * 0.05, "Pobieranie workera FFmpeg…"),
          )
        : undefined;
      const ff = new mod.FFmpeg();
      ff.on("log", () => undefined);
      ff.on("progress", (data: never) => {
        const p = data as unknown as { progress: number; time: number };
        const ratio = this.durationHint > 0 ? Math.min(1, p.time / 1_000_000 / this.durationHint) : p.progress;
        if (isFinite(ratio) && ratio >= 0) this.progressCb?.(Math.min(0.999, ratio), "Transkodowanie FFmpeg…");
      });
      onProgress?.(0.85, "Inicjalizacja rdzenia…");
      await withTimeout(
        ff.load({
          coreURL,
          wasmURL,
          classWorkerURL,
          ...(workerURL ? { workerURL } : {}),
        }),
        45_000,
        "Inicjalizacja FFmpeg przekroczyła 45 sekund. Sprawdź worker i nagłówki COOP/COEP.",
      );
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
    const inputName = virtualFileName(req.inputName);
    const outputName = virtualFileName(req.outputName);
    const bytes = new Uint8Array(await req.input.arrayBuffer());
    await ff.writeFile(inputName, bytes);
    const args = req.extraArgs ?? buildFFmpegArgs(req.settings, inputName, outputName);
    if (args.some((arg) => arg === "ffprobe" || arg.endsWith("/ffprobe"))) {
      throw new Error("Nieprawidłowa komenda FFmpeg: do transkodowania przekazano ffprobe zamiast pliku wyjściowego.");
    }
    try {
      const code = await ff.exec(args);
      if (code !== 0) {
        throw new Error(
          `FFmpeg zakończył się kodem ${code}. Wybrany kodek może nie być dostępny w rdzeniu WebAssembly ` +
            `(np. libx265/libaom wymagają natywnego backendu).`,
        );
      }
      const data = await ff.readFile(outputName);
      const bin = typeof data === "string" ? new TextEncoder().encode(data) : data;
      const mime =
        req.settings.container === "mp4"
          ? "video/mp4"
          : req.settings.container === "mkv"
            ? "video/x-matroska"
            : req.settings.container === "gif"
              ? "image/gif"
              : "video/webm";
      return new Blob([bin as BlobPart], { type: mime });
    } finally {
      await ff.deleteFile(inputName).catch(() => undefined);
      await ff.deleteFile(outputName).catch(() => undefined);
      this.progressCb = null;
    }
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
    const blob = await res.blob();
    if (req.settings.container !== "webm" && (blob.type === "video/webm" || (await startsWithEbml(blob)))) {
      throw new Error(
        "Backend zwrócił WebM zamiast żądanego formatu. Sprawdź, czy endpoint /transcode wykonuje przekazane argumenty FFmpeg.",
      );
    }
    return blob;
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
