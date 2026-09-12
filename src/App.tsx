import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TopAppBar } from "@/components/layout/TopAppBar";
import { MediaLibrary } from "@/components/media/MediaLibrary";
import { PreviewPanel } from "@/components/preview/PreviewPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { Inspector } from "@/components/inspector/Inspector";
import { ExportDialog } from "@/components/export/ExportDialog";
import { ProjectSettingsDialog, SettingsDialog } from "@/components/settings/SettingsDialogs";
import { ImportOverlay, MarkerDialog, ProjectsDialog, ShortcutsDialog, SnackbarHost } from "@/components/common/Overlays";
import { BottomSheet, Icon } from "@/components/ui";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useMediaImport } from "@/hooks/useMediaImport";
import { useProjectPersistence } from "@/hooks/useProjectPersistence";
import { playbackEngine } from "@/services/playback/engine";
import { resumeAudio } from "@/services/audio/waveform";
import { applyTheme } from "@/theme/palette";
import { capabilities } from "@/services/export/capabilities";
import { cn } from "@/utils/cn";

function Divider({
  orientation,
  onDrag,
  className,
}: {
  orientation: "vertical" | "horizontal";
  onDrag: (delta: number) => void;
  className?: string;
}) {
  const start = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = orientation === "vertical" ? e.clientX : e.clientY;
    let last = startPos;
    const move = (ev: PointerEvent) => {
      const pos = orientation === "vertical" ? ev.clientX : ev.clientY;
      onDrag(pos - last);
      last = pos;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      onPointerDown={start}
      className={cn(
        "group relative z-10 shrink-0 bg-surface-variant/40 transition-colors hover:bg-primary/40",
        orientation === "vertical" ? "w-[3px] cursor-col-resize" : "h-[3px] cursor-row-resize",
        className,
      )}
    />
  );
}

export default function App() {
  const project = useProjectStore((s) => s.project);
  const newProject = useProjectStore((s) => s.newProject);
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const openDialog = useUiStore((s) => s.openDialog);
  const notify = useUiStore((s) => s.notify);

  const { importFiles } = useMediaImport();
  const { saveNow, openProject } = useProjectPersistence();
  useShortcuts();

  const [leftWidth, setLeftWidth] = useState(320);
  const [rightWidth, setRightWidth] = useState(316);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [dropping, setDropping] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"library" | "inspector" | null>(null);
  const dragDepth = useRef(0);

  /* theme */
  useEffect(() => {
    applyTheme(theme, accent);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system", accent);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme, accent]);

  /* keep the playback engine in sync with the project */
  const assetMap = useMemo(() => new Map(project.assets.map((a) => [a.id, a])), [project.assets]);
  useEffect(() => {
    playbackEngine.setProject(project, assetMap);
  }, [project, assetMap]);
  useEffect(() => () => playbackEngine.stop(), []);

  /* resume AudioContext on the first interaction */
  useEffect(() => {
    const handler = () => void resumeAudio();
    window.addEventListener("pointerdown", handler, { once: true });
    window.addEventListener("keydown", handler, { once: true });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  /* browser capability warning */
  useEffect(() => {
    if (!capabilities.mediaRecorder || !capabilities.captureStream) {
      notify({
        text: "Ta przeglądarka nie obsługuje nagrywania kompozycji (MediaRecorder / captureStream). Eksport będzie niedostępny.",
        tone: "error",
        duration: 12000,
      });
    }
  }, [notify]);

  /* Ctrl+S */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow().then(() => notify("Projekt zapisany w przeglądarce."));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow, notify]);

  /* global drag & drop import */
  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragDepth.current += 1;
    setDropping(true);
  }, []);
  const onDragLeave = useCallback(() => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) void importFiles(files);
    },
    [importFiles],
  );

  return (
    <div
      className="flex h-full flex-col bg-background text-on-background"
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <TopAppBar
        onSave={() => void saveNow().then(() => notify("Projekt zapisany w przeglądarce."))}
        onNewProject={() => {
          newProject();
          notify("Utworzono nowy, pusty projekt.");
        }}
        onOpenProjects={() => openDialog("projects")}
      />

      <main className="flex min-h-0 flex-1 flex-col gap-[3px] px-0 pb-0">
        <div className="flex min-h-0 flex-1">
          {leftPanel && (
            <>
              <div className="hidden min-h-0 md:block" style={{ width: leftWidth }}>
                <MediaLibrary />
              </div>
              <Divider
                className="hidden md:block"
                orientation="vertical"
                onDrag={(d) => setLeftWidth((w) => Math.max(240, Math.min(520, w + d)))}
              />
            </>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <PreviewPanel />
          </div>

          {rightPanel && (
            <>
              <Divider
                className="hidden lg:block"
                orientation="vertical"
                onDrag={(d) => setRightWidth((w) => Math.max(260, Math.min(520, w - d)))}
              />
              <div className="hidden min-h-0 lg:block" style={{ width: rightWidth }}>
                <Inspector />
              </div>
            </>
          )}
        </div>

        <Divider
          orientation="horizontal"
          onDrag={(d) => setTimelineHeight((h) => Math.max(180, Math.min(window.innerHeight - 260, h - d)))}
        />

        <div className="flex min-h-0 flex-col" style={{ height: timelineHeight }}>
          <Timeline />
        </div>
      </main>

      {/* mobile / tablet navigation */}
      <nav className="flex shrink-0 items-center justify-around border-t border-outline-variant bg-surf px-2 py-1 lg:hidden">
        <button
          onClick={() => setMobileSheet("library")}
          className="state-layer flex flex-col items-center gap-0.5 rounded-[12px] px-4 py-1.5 text-[10px] text-on-surface-variant"
        >
          <Icon name="perm_media" size={20} />
          Biblioteka
        </button>
        <button
          onClick={() => setMobileSheet("inspector")}
          className="state-layer flex flex-col items-center gap-0.5 rounded-[12px] px-4 py-1.5 text-[10px] text-on-surface-variant"
        >
          <Icon name="tune" size={20} />
          Inspektor
        </button>
        <button
          onClick={() => openDialog("export")}
          className="state-layer flex flex-col items-center gap-0.5 rounded-[12px] px-4 py-1.5 text-[10px] text-on-surface-variant"
        >
          <Icon name="ios_share" size={20} />
          Eksport
        </button>
      </nav>

      <BottomSheet open={mobileSheet === "library"} onClose={() => setMobileSheet(null)} title="Biblioteka projektu">
        <div className="h-[62vh]">
          <MediaLibrary />
        </div>
      </BottomSheet>
      <BottomSheet open={mobileSheet === "inspector"} onClose={() => setMobileSheet(null)} title="Inspektor">
        <div className="h-[62vh]">
          <Inspector />
        </div>
      </BottomSheet>

      {dropping && (
        <div className="pointer-events-none fixed inset-0 z-[400] grid place-items-center bg-black/50 anim-fade">
          <div className="flex flex-col items-center gap-3 rounded-[28px] border-2 border-dashed border-primary bg-surf-high px-10 py-8">
            <Icon name="upload_file" size={40} className="text-primary" />
            <p className="text-[16px] font-medium text-on-surface">Upuść pliki, aby zaimportować</p>
            <p className="text-[12px] text-on-surface-variant">Wideo, audio oraz napisy SRT / VTT</p>
          </div>
        </div>
      )}

      <ExportDialog />
      <SettingsDialog />
      <ProjectSettingsDialog />
      <ProjectsDialog onOpenProject={openProject} />
      <ShortcutsDialog />
      <MarkerDialog />
      <ImportOverlay />
      <SnackbarHost />
    </div>
  );
}
