import { useEffect, useRef, useState } from "react";
import { Button, Icon, IconButton, Menu, Tooltip } from "@/components/ui";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { formatTime } from "@/utils/format";
import { projectDuration } from "@/features/timeline/selectors";

export function TopAppBar({
  onSave,
  onNewProject,
  onOpenProjects,
}: {
  onSave: () => void;
  onNewProject: () => void;
  onOpenProjects: () => void;
}) {
  const name = useProjectStore((s) => s.project.name);
  const dirty = useProjectStore((s) => s.dirty);
  const lastSavedAt = useProjectStore((s) => s.lastSavedAt);
  const canUndo = useProjectStore((s) => s.past.length > 0);
  const canRedo = useProjectStore((s) => s.future.length > 0);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const rename = useProjectStore((s) => s.renameProject);
  const duration = useProjectStore((s) => projectDuration(s.project));
  const openDialog = useUiStore((s) => s.openDialog);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const leftPanel = useUiStore((s) => s.leftPanel);
  const rightPanel = useUiStore((s) => s.rightPanel);
  const theme = useSettingsStore((s) => s.theme);
  const setSetting = useSettingsStore((s) => s.set);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(name), [name]);
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) rename(next);
    else setDraft(name);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const cycleTheme = () => {
    const order = ["system", "light", "dark", "amoled"] as const;
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setSetting("theme", next);
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-outline-variant bg-surf px-1.5 sm:px-3">
      <div className="flex items-center gap-2 pr-1">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-primary text-on-primary">
          <Icon name="movie_edit" size={20} filled />
        </span>
        <span className="hidden text-[15px] font-medium tracking-tight text-on-surface lg:block">
          FreeCut
        </span>
      </div>

      <div className="mx-1 hidden h-6 w-px bg-outline-variant sm:block" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            className="h-9 min-w-0 max-w-[280px] flex-1 rounded-[10px] bg-surf-high px-3 text-[14px] font-medium text-on-surface outline-none ring-2 ring-primary"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="state-layer flex min-w-0 items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-left"
            title="Zmień nazwę projektu"
          >
            <span className="truncate text-[14px] font-medium text-on-surface">{name}</span>
            <Icon name="edit" size={14} className="shrink-0 text-on-surface-variant" />
          </button>
        )}
        <span className="hidden items-center gap-1 rounded-full bg-surf-high px-2.5 py-1 text-[11px] text-on-surface-variant md:inline-flex">
          <Icon name={dirty ? "cloud_upload" : "cloud_done"} size={14} />
          {dirty ? "Niezapisane zmiany" : lastSavedAt ? "Zapisano" : "Nowy projekt"}
        </span>
        <span className="hidden items-center gap-1 rounded-full bg-surf-high px-2.5 py-1 font-mono text-[11px] text-on-surface-variant xl:inline-flex">
          <Icon name="schedule" size={14} />
          {formatTime(duration, false)}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <IconButton icon="undo" label="Cofnij (Ctrl+Z)" onClick={undo} disabled={!canUndo} />
        <IconButton icon="redo" label="Ponów (Ctrl+Shift+Z)" onClick={redo} disabled={!canRedo} />
        <IconButton icon="cloud_upload" label="Zapisz do Google Drive" onClick={() => openDialog("googleDrive")} />
        <div className="mx-1 hidden h-6 w-px bg-outline-variant sm:block" />
        <IconButton
          icon="left_panel_open"
          label="Panel biblioteki"
          selected={leftPanel}
          onClick={() => togglePanel("left")}
          className="hidden md:inline-flex"
        />
        <IconButton
          icon="right_panel_open"
          label="Panel inspektora"
          selected={rightPanel}
          onClick={() => togglePanel("right")}
          className="hidden md:inline-flex"
        />
        <IconButton
          icon={theme === "light" ? "light_mode" : theme === "dark" ? "dark_mode" : theme === "amoled" ? "contrast" : "brightness_auto"}
          label={`Motyw: ${theme}`}
          onClick={cycleTheme}
        />
        <IconButton icon="fullscreen" label="Pełny ekran" onClick={toggleFullscreen} className="hidden sm:inline-flex" />
        <Menu
          align="right"
          items={[
            { id: "new", label: "Nowy projekt", icon: "add_box", onSelect: onNewProject },
            { id: "open", label: "Otwórz projekt…", icon: "folder_open", onSelect: onOpenProjects },
            { id: "save", label: "Zapisz projekt", icon: "save", shortcut: "Ctrl+S", onSelect: onSave },
            { id: "gdrive", label: "Google Drive…", icon: "cloud", onSelect: () => openDialog("googleDrive") },
            { id: "d1", label: "", divider: true },
            { id: "psettings", label: "Ustawienia projektu", icon: "aspect_ratio", onSelect: () => openDialog("projectSettings") },
            { id: "settings", label: "Ustawienia aplikacji", icon: "settings", onSelect: () => openDialog("settings") },
            { id: "shortcuts", label: "Skróty klawiszowe", icon: "keyboard", onSelect: () => openDialog("shortcuts") },
          ]}
          trigger={({ onClick, ref }) => (
            <Tooltip label="Więcej">
              <button
                ref={ref}
                onClick={onClick}
                aria-label="Menu aplikacji"
                className="state-layer grid h-10 w-10 place-items-center rounded-full text-on-surface-variant"
              >
                <Icon name="more_vert" size={20} />
              </button>
            </Tooltip>
          )}
        />
        <Button
          icon="ios_share"
          className="ml-1 hidden sm:inline-flex"
          onClick={() => openDialog("export")}
        >
          Eksportuj
        </Button>
        <IconButton
          icon="ios_share"
          label="Eksportuj"
          variant="filled"
          selected
          className="ml-1 sm:hidden"
          onClick={() => openDialog("export")}
        />
      </div>
    </header>
  );
}
