import { useEffect, useState } from "react";
import type { Project } from "@/types";
import { Button, Dialog, EmptyState, Icon, IconButton, LinearProgress, TextField } from "@/components/ui";
import { useUiStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import { projectRepo } from "@/services/project/db";
import { formatTime } from "@/utils/format";
import { cn } from "@/utils/cn";

/* ----------------------------- Snackbars ----------------------------- */

export function SnackbarHost() {
  const snackbars = useUiStore((s) => s.snackbars);
  const dismiss = useUiStore((s) => s.dismiss);
  if (!snackbars.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[300] flex w-[min(560px,92vw)] -translate-x-1/2 flex-col gap-2">
      {snackbars.map((s) => (
        <div
          key={s.id}
          role="status"
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-[10px] px-4 py-3 shadow-xl anim-sheet",
            s.tone === "error" ? "bg-error-container text-on-error-container" : "bg-inverse-surface text-inverse-on-surface",
          )}
        >
          {s.tone === "error" && <Icon name="error" size={18} />}
          <p className="flex-1 text-[13px]">{s.text}</p>
          {s.action && (
            <button
              onClick={() => {
                s.onAction?.();
                dismiss(s.id);
              }}
              className="state-layer rounded-full px-3 py-1 text-[13px] font-medium text-inverse-primary"
            >
              {s.action}
            </button>
          )}
          <IconButton icon="close" label="Zamknij powiadomienie" size={28} onClick={() => dismiss(s.id)} />
        </div>
      ))}
    </div>
  );
}

/* --------------------------- Import progress -------------------------- */

export function ImportOverlay() {
  const imports = useUiStore((s) => s.imports);
  const clear = useUiStore((s) => s.clearImports);
  if (!imports.length) return null;
  const allDone = imports.every((t) => t.done);
  return (
    <div className="fixed bottom-4 right-4 z-[250] w-[min(360px,92vw)] overflow-hidden rounded-[16px] bg-surf-high shadow-2xl ring-1 ring-outline-variant anim-scale">
      <div className="flex items-center gap-2 px-4 py-3">
        <Icon name={allDone ? "check_circle" : "cloud_upload"} size={18} className="text-primary" />
        <p className="flex-1 text-[13px] font-medium text-on-surface">
          {allDone ? "Import zakończony" : `Importowanie ${imports.filter((t) => !t.done).length} plik(ów)`}
        </p>
        <IconButton icon="close" label="Ukryj" size={30} onClick={clear} />
      </div>
      <div className="max-h-[240px] overflow-y-auto px-4 pb-3">
        {imports.map((t) => (
          <div key={t.id} className="py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12px] text-on-surface">{t.name}</span>
              <span className={cn("text-[11px]", t.error ? "text-error" : "text-on-surface-variant")}>
                {t.error ? "Błąd" : t.stage}
              </span>
            </div>
            <LinearProgress value={t.progress} indeterminate={!t.done && t.progress < 0.15} className="mt-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------- Shortcuts ----------------------------- */

const SHORTCUTS: [string, string][] = [
  ["Spacja", "Odtwarzanie / pauza"],
  ["J / K / L", "Przewijanie wstecz / stop / szybciej"],
  ["S", "Podziel klip w playheadzie"],
  ["M", "Dodaj marker"],
  ["Delete / Backspace", "Usuń zaznaczone klipy"],
  ["← / →", "Klatka wstecz / naprzód"],
  ["Shift + ← / →", "Sekunda wstecz / naprzód"],
  ["Home / End", "Początek / koniec osi czasu"],
  ["Ctrl/Cmd + Z", "Cofnij"],
  ["Ctrl/Cmd + Shift + Z", "Ponów"],
  ["Ctrl/Cmd + C / V", "Kopiuj / wklej klipy"],
  ["Ctrl/Cmd + D", "Duplikuj"],
  ["Ctrl/Cmd + A", "Zaznacz wszystko"],
  ["Ctrl/Cmd + S", "Zapisz projekt"],
  ["V / C", "Narzędzie zaznaczania / żyletka"],
  ["Esc", "Wyczyść zaznaczenie"],
];

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.dialog) === "shortcuts";
  const close = useUiStore((s) => s.closeDialog);
  return (
    <Dialog open={open} onClose={close} title="Skróty klawiszowe" icon="keyboard" size="md" actions={<Button onClick={close}>Zamknij</Button>}>
      <div className="grid gap-1 sm:grid-cols-2">
        {SHORTCUTS.map(([key, desc]) => (
          <div key={key} className="flex items-center justify-between gap-3 rounded-[10px] bg-surf px-3 py-2">
            <span className="text-[12px] text-on-surface">{desc}</span>
            <kbd className="rounded-[6px] bg-surf-highest px-2 py-1 font-mono text-[10px] text-on-surface-variant">{key}</kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

/* ------------------------------ Projects ----------------------------- */

export function ProjectsDialog({ onOpenProject }: { onOpenProject: (id: string) => Promise<void> | void }) {
  const open = useUiStore((s) => s.dialog) === "projects";
  const close = useUiStore((s) => s.closeDialog);
  const notify = useUiStore((s) => s.notify);
  const currentId = useProjectStore((s) => s.project.id);
  const [projects, setProjects] = useState<Project[]>([]);

  const refresh = () => void projectRepo.list().then(setProjects);
  useEffect(() => {
    if (open) refresh();
  }, [open]);

  return (
    <Dialog open={open} onClose={close} title="Projekty" icon="folder_open" size="md" actions={<Button onClick={close}>Zamknij</Button>}>
      {projects.length === 0 ? (
        <EmptyState
          compact
          icon="folder_off"
          title="Brak zapisanych projektów"
          description="Zapisz bieżący projekt, aby pojawił się na tej liście."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[12px] bg-surf p-3">
              <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-primary-container text-on-primary-container">
                <Icon name="movie" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-on-surface">
                  {p.name}
                  {p.id === currentId && <span className="ml-2 text-[11px] text-primary">(otwarty)</span>}
                </p>
                <p className="text-[11px] text-on-surface-variant">
                  {p.clips.length} klipów · {p.assets.length} materiałów · zapisano{" "}
                  {new Date(p.updatedAt).toLocaleString("pl-PL")}
                </p>
              </div>
              <Button
                variant="tonal"
                onClick={async () => {
                  await onOpenProject(p.id);
                  close();
                }}
              >
                Otwórz
              </Button>
              <IconButton
                icon="delete"
                label="Usuń projekt"
                onClick={async () => {
                  await projectRepo.remove(p.id);
                  notify("Projekt usunięty.");
                  refresh();
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------- Marker ------------------------------ */

export function MarkerDialog() {
  const open = useUiStore((s) => s.dialog) === "marker";
  const close = useUiStore((s) => s.closeDialog);
  const id = useUiStore((s) => s.activeMarkerId);
  const marker = useProjectStore((s) => s.project.markers.find((m) => m.id === id));
  const update = useProjectStore((s) => s.updateMarker);
  const remove = useProjectStore((s) => s.removeMarker);
  if (!marker) return null;
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Marker"
      icon="bookmark"
      size="sm"
      actions={
        <>
          <Button
            variant="text"
            onClick={() => {
              remove(marker.id);
              close();
            }}
          >
            Usuń
          </Button>
          <Button onClick={close}>Gotowe</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <TextField label="Nazwa" value={marker.name} onChange={(e) => update(marker.id, { name: e.target.value })} />
        <TextField label="Opis" value={marker.note} onChange={(e) => update(marker.id, { note: e.target.value })} />
        <div className="flex items-center justify-between rounded-[12px] bg-surf p-3">
          <span className="text-[12px] text-on-surface">Kolor</span>
          <input
            type="color"
            value={marker.color}
            onChange={(e) => update(marker.id, { color: e.target.value })}
            aria-label="Kolor markera"
            className="h-8 w-12 rounded-[6px] border border-outline-variant bg-transparent"
          />
        </div>
        <p className="text-[12px] text-on-surface-variant">Pozycja: {formatTime(marker.time)}</p>
      </div>
    </Dialog>
  );
}
