import { create } from "zustand";
import type { ExportPhase, ExportSettings } from "@/types";

export interface ExportOutcome {
  fileName: string;
  size: number;
  mime: string;
  blob: Blob;
  savedVia?: "download" | "filesystem";
}

interface ExportState {
  settings: ExportSettings;
  phase: ExportPhase;
  ratio: number;
  message: string;
  startedAt: number;
  elapsed: number;
  remaining: number | null;
  error: string | null;
  outcome: ExportOutcome | null;
  controller: AbortController | null;

  patch: (patch: Partial<ExportSettings>) => void;
  begin: (controller: AbortController) => void;
  progress: (phase: ExportPhase, ratio: number, message: string) => void;
  finish: (outcome: ExportOutcome) => void;
  fail: (error: string) => void;
  cancel: () => void;
  reset: () => void;
}

export const defaultExportSettings: ExportSettings = {
  profileId: "youtube-1080p",
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
  fps: 30,
  quality: "high",
  videoBitrate: 12000,
  audioBitrate: 192,
  sampleRate: 48000,
  engine: "ffmpeg-wasm",
  destination: "download",
  burnSubtitles: true,
  rangeStart: null,
  rangeEnd: null,
};

export const useExportStore = create<ExportState>((set, get) => ({
  settings: { ...defaultExportSettings },
  phase: "idle",
  ratio: 0,
  message: "",
  startedAt: 0,
  elapsed: 0,
  remaining: null,
  error: null,
  outcome: null,
  controller: null,

  patch: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  begin: (controller) =>
    set({
      controller,
      phase: "preparing",
      ratio: 0,
      message: "Przygotowywanie…",
      startedAt: Date.now(),
      elapsed: 0,
      remaining: null,
      error: null,
      outcome: null,
    }),
  progress: (phase, ratio, message) => {
    const { startedAt } = get();
    const elapsed = (Date.now() - startedAt) / 1000;
    const remaining = ratio > 0.02 ? Math.max(0, elapsed / ratio - elapsed) : null;
    set({ phase, ratio, message, elapsed, remaining });
  },
  finish: (outcome) =>
    set((s) => ({
      phase: "done",
      ratio: 1,
      message: "Eksport zakończony",
      outcome,
      controller: null,
      elapsed: (Date.now() - s.startedAt) / 1000,
      remaining: 0,
    })),
  fail: (error) => set({ phase: "error", error, controller: null }),
  cancel: () => {
    get().controller?.abort();
    set({ phase: "cancelled", message: "Eksport anulowany", controller: null });
  },
  reset: () =>
    set({ phase: "idle", ratio: 0, message: "", error: null, outcome: null, controller: null, remaining: null }),
}));
