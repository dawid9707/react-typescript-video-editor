/**
 * Central registry for binary media. Keeps object URLs alive for the
 * session and hands out pooled <video>/<audio>/<img> elements so the
 * preview and the exporter can share decoders.
 */
class MediaPool {
  private urls = new Map<string, string>();
  private files = new Map<string, File>();
  private videos = new Map<string, HTMLVideoElement>();
  private audios = new Map<string, HTMLAudioElement>();
  private images = new Map<string, HTMLImageElement>();

  register(assetId: string, file: File): string {
    const existing = this.urls.get(assetId);
    if (existing) return existing;
    const url = URL.createObjectURL(file);
    this.urls.set(assetId, url);
    this.files.set(assetId, file);
    return url;
  }

  registerUrl(assetId: string, url: string): void {
    this.urls.set(assetId, url);
  }

  has(assetId: string): boolean {
    return this.urls.has(assetId);
  }

  getUrl(assetId: string): string | undefined {
    return this.urls.get(assetId);
  }

  getFile(assetId: string): File | undefined {
    return this.files.get(assetId);
  }

  /** One element per key (usually a clip id) so overlapping clips stay independent. */
  getVideo(key: string, assetId: string): HTMLVideoElement | null {
    const url = this.urls.get(assetId);
    if (!url) return null;
    let el = this.videos.get(key);
    if (!el) {
      el = document.createElement("video");
      el.preload = "auto";
      el.playsInline = true;
      el.crossOrigin = "anonymous";
      el.muted = true;
      el.src = url;
      el.load();
      this.videos.set(key, el);
    } else if (!el.src.startsWith("blob:") || el.dataset.assetId !== assetId) {
      el.src = url;
      el.load();
    }
    el.dataset.assetId = assetId;
    return el;
  }

  getAudio(key: string, assetId: string): HTMLAudioElement | null {
    const url = this.urls.get(assetId);
    if (!url) return null;
    let el = this.audios.get(key);
    if (!el) {
      el = new Audio();
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.src = url;
      el.load();
      this.audios.set(key, el);
    }
    el.dataset.assetId = assetId;
    return el;
  }

  getImage(assetId: string): HTMLImageElement | null {
    const url = this.urls.get(assetId);
    if (!url) return null;
    let el = this.images.get(assetId);
    if (!el) {
      el = new Image();
      el.src = url;
      this.images.set(assetId, el);
    }
    return el;
  }

  releaseElement(key: string): void {
    const v = this.videos.get(key);
    if (v) {
      v.pause();
      v.removeAttribute("src");
      v.load();
      this.videos.delete(key);
    }
    const a = this.audios.get(key);
    if (a) {
      a.pause();
      a.removeAttribute("src");
      this.audios.delete(key);
    }
  }

  release(assetId: string): void {
    const url = this.urls.get(assetId);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(assetId);
    this.files.delete(assetId);
    this.images.delete(assetId);
    for (const [key, el] of this.videos) {
      if (el.dataset.assetId === assetId) {
        el.pause();
        this.videos.delete(key);
      }
    }
    for (const [key, el] of this.audios) {
      if (el.dataset.assetId === assetId) {
        el.pause();
        this.audios.delete(key);
      }
    }
  }

  allVideoElements(): HTMLVideoElement[] {
    return [...this.videos.values()];
  }

  allAudioElements(): HTMLAudioElement[] {
    return [...this.audios.values()];
  }
}

export const mediaPool = new MediaPool();
