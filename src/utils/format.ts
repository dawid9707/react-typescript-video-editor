export const uid = (prefix = "id"): string =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 00:00:12.480 */
export function formatTime(seconds: number, showMs = true): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  const base = `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(
    s,
  ).padStart(2, "0")}`;
  return showMs ? `${base}.${String(ms).padStart(3, "0")}` : base;
}

/** 00:00:12:14 (timecode with frames) */
export function formatTimecode(seconds: number, fps: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.round(seconds * fps);
  const f = total % Math.round(fps);
  const totalSec = Math.floor(total / fps);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatBitrate(kbps: number): string {
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(kbps % 1000 === 0 ? 0 : 1)} Mb/s` : `${kbps} kb/s`;
}

export function parseTimecode(value: string, fps: number): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 2 || parts.some((p) => p === "" || isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (parts.length === 4) {
    const [h, m, s, f] = nums;
    return h * 3600 + m * 60 + s + f / fps;
  }
  if (parts.length === 3) {
    const [h, m, s] = nums;
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = nums;
  return m * 60 + s;
}

export const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function aspectLabel(w: number, h: number): string {
  const d = gcd(w, h) || 1;
  return `${w / d}:${h / d}`;
}

export function humanDuration(sec: number): string {
  if (!isFinite(sec)) return "—";
  if (sec < 60) return `${sec.toFixed(1)} s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m} min ${s} s`;
}

export function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let last = 0;
  let timer: number | undefined;
  let pending: unknown[] | null = null;
  const run = (args: unknown[]) => {
    last = performance.now();
    (fn as unknown as (...a: unknown[]) => void)(...args);
  };
  return ((...args: unknown[]) => {
    const now = performance.now();
    if (now - last >= ms) {
      run(args);
    } else {
      pending = args;
      if (timer === undefined) {
        timer = window.setTimeout(
          () => {
            timer = undefined;
            if (pending) run(pending);
            pending = null;
          },
          ms - (now - last),
        );
      }
    }
  }) as unknown as T;
}

export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: number | undefined;
  return ((...args: unknown[]) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => (fn as unknown as (...a: unknown[]) => void)(...args), ms);
  }) as unknown as T;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
