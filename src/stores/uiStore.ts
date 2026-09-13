import { create } from "zustand";
import type { SnackbarMessage } from "@/types";
import { uid } from "@/utils/format";

export type LibraryTab = "media" | "audio" | "subtitles" | "effects" | "transitions" | "text" | "shapes";
export type DialogId =
  | "export"
  | "settings"
  | "projectSettings"
  | "projects"
  | "googleDrive"
  | "shortcuts"
  | "marker"
  | "subtitleEditor"
  | null;
export type ToolId = "select" | "razor" | "hand";

export interface ImportTask {
  id: string;
  name: string;
  progress: number;
  stage: string;
  error?: string;
  done?: boolean;
}

interface UiState {
  selectedClipIds: string[];
  selectedAssetId: string | null;
  previewAssetId: string | null;
  libraryTab: LibraryTab;
  libraryView: "grid" | "list";
  librarySearch: string;
  librarySort: "recent" | "name" | "duration" | "size";
  leftPanel: boolean;
  rightPanel: boolean;
  dialog: DialogId;
  tool: ToolId;
  pixelsPerSecond: number;
  snackbars: SnackbarMessage[];
  imports: ImportTask[];
  importOverlay: boolean;
  activeMarkerId: string | null;
  inspectorTab: "video" | "color" | "audio" | "effects";
  fullscreen: boolean;

  select: (ids: string[], additive?: boolean) => void;
  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  setSelectedAsset: (id: string | null) => void;
  setPreviewAsset: (id: string | null) => void;
  setLibraryTab: (tab: LibraryTab) => void;
  setLibraryView: (view: "grid" | "list") => void;
  setLibrarySearch: (q: string) => void;
  setLibrarySort: (s: UiState["librarySort"]) => void;
  togglePanel: (side: "left" | "right", value?: boolean) => void;
  openDialog: (id: DialogId) => void;
  closeDialog: () => void;
  setTool: (tool: ToolId) => void;
  setPixelsPerSecond: (pps: number) => void;
  setInspectorTab: (tab: UiState["inspectorTab"]) => void;
  setActiveMarker: (id: string | null) => void;
  setFullscreen: (v: boolean) => void;

  notify: (message: Omit<SnackbarMessage, "id"> | string) => string;
  dismiss: (id: string) => void;

  startImport: (name: string) => string;
  updateImport: (id: string, patch: Partial<ImportTask>) => void;
  clearImports: () => void;
  setImportOverlay: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  selectedClipIds: [],
  selectedAssetId: null,
  previewAssetId: null,
  libraryTab: "media",
  libraryView: "grid",
  librarySearch: "",
  librarySort: "recent",
  leftPanel: true,
  rightPanel: true,
  dialog: null,
  tool: "select",
  pixelsPerSecond: 70,
  snackbars: [],
  imports: [],
  importOverlay: false,
  activeMarkerId: null,
  inspectorTab: "video",
  fullscreen: false,

  select: (ids, additive) =>
    set((s) => ({
      selectedClipIds: additive ? [...new Set([...s.selectedClipIds, ...ids])] : ids,
    })),
  toggleSelect: (id) =>
    set((s) => ({
      selectedClipIds: s.selectedClipIds.includes(id)
        ? s.selectedClipIds.filter((c) => c !== id)
        : [...s.selectedClipIds, id],
    })),
  clearSelection: () => set({ selectedClipIds: [] }),
  setSelectedAsset: (id) => set({ selectedAssetId: id }),
  setPreviewAsset: (id) => set({ previewAssetId: id }),
  setLibraryTab: (libraryTab) => set({ libraryTab }),
  setLibraryView: (libraryView) => set({ libraryView }),
  setLibrarySearch: (librarySearch) => set({ librarySearch }),
  setLibrarySort: (librarySort) => set({ librarySort }),
  togglePanel: (side, value) =>
    set((s) =>
      side === "left" ? { leftPanel: value ?? !s.leftPanel } : { rightPanel: value ?? !s.rightPanel },
    ),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setTool: (tool) => set({ tool }),
  setPixelsPerSecond: (pixelsPerSecond) => set({ pixelsPerSecond: Math.max(6, Math.min(600, pixelsPerSecond)) }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setActiveMarker: (activeMarkerId) => set({ activeMarkerId }),
  setFullscreen: (fullscreen) => set({ fullscreen }),

  notify: (message) => {
    const id = uid("snack");
    const payload: SnackbarMessage =
      typeof message === "string" ? { id, text: message } : { id, ...message };
    set((s) => ({ snackbars: [...s.snackbars.slice(-2), payload] }));
    const duration = payload.duration ?? (payload.tone === "error" ? 8000 : 4500);
    window.setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set((s) => ({ snackbars: s.snackbars.filter((m) => m.id !== id) })),

  startImport: (name) => {
    const id = uid("imp");
    set((s) => ({ imports: [...s.imports, { id, name, progress: 0, stage: "W kolejce" }], importOverlay: true }));
    return id;
  },
  updateImport: (id, patch) =>
    set((s) => ({ imports: s.imports.map((t) => (t.id === id ? { ...t, ...patch } : t)) })),
  clearImports: () => set({ imports: [], importOverlay: false }),
  setImportOverlay: (importOverlay) => set({ importOverlay }),
}));
