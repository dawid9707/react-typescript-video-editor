import { useCallback, useEffect, useRef } from "react";
import type { Project } from "@/types";
import { blobRepo, projectRepo, recoveryRepo } from "@/services/project/db";
import { mediaPool } from "@/services/media/pool";
import { useProjectStore } from "@/stores/projectStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";

/** Re-attaches binary media stored in IndexedDB to the in-memory pool. */
export async function hydrateProjectMedia(project: Project): Promise<string[]> {
  const missing: string[] = [];
  for (const asset of project.assets) {
    if (asset.kind === "subtitle" || mediaPool.has(asset.id)) continue;
    const stored = await blobRepo.get(asset.id);
    if (!stored) {
      missing.push(asset.name);
      continue;
    }
    const file = new File([stored.blob], stored.fileName, { type: stored.type });
    mediaPool.register(asset.id, file);
  }
  return missing;
}

export function useProjectPersistence() {
  const autoSave = useSettingsStore((s) => s.autoSave);
  const timer = useRef<number | undefined>(undefined);

  const saveNow = useCallback(async () => {
    const { project, markSaved } = useProjectStore.getState();
    await projectRepo.save(project);
    await recoveryRepo.write(project);
    markSaved();
    return project;
  }, []);

  const openProject = useCallback(async (id: string) => {
    const project = await projectRepo.get(id);
    if (!project) {
      useUiStore.getState().notify({ text: "Nie znaleziono projektu.", tone: "error" });
      return;
    }
    useProjectStore.getState().loadProject(project);
    const missing = await hydrateProjectMedia(project);
    if (missing.length) {
      useUiStore.getState().notify({
        text: `Brak plików źródłowych: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}. Zaimportuj je ponownie.`,
        tone: "error",
      });
    }
  }, []);

  // Auto-save (debounced) on every project mutation.
  useEffect(() => {
    if (!autoSave) return;
    const unsub = useProjectStore.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void projectRepo.save(state.project);
        void recoveryRepo.write(state.project);
        useProjectStore.getState().markSaved();
      }, 2500);
    });
    return () => {
      unsub();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [autoSave]);

  // Warn before closing with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useProjectStore.getState().dirty && useProjectStore.getState().project.clips.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Offer recovery of the last auto-saved session.
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    void (async () => {
      const rec = await recoveryRepo.read();
      if (!rec || !rec.project.clips.length) return;
      const current = useProjectStore.getState().project;
      if (current.clips.length) return;
      useUiStore.getState().notify({
        text: `Znaleziono niezapisaną sesję „${rec.project.name}”.`,
        action: "Przywróć",
        duration: 15000,
        onAction: () => {
          useProjectStore.getState().loadProject(rec.project);
          void hydrateProjectMedia(rec.project).then((missing) => {
            if (missing.length) {
              useUiStore.getState().notify({
                text: `Przywrócono projekt, ale brakuje plików: ${missing.join(", ")}.`,
                tone: "error",
              });
            }
          });
        },
      });
    })();
  }, []);

  return { saveNow, openProject };
}
