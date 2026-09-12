import { useCallback } from "react";
import type { MediaAsset, SubtitleAsset } from "@/types";
import { ACCEPT_ATTRIBUTE, extOf, kindOf, probeMediaFile } from "@/services/media/probe";
import { parseSubtitles } from "@/services/subtitles/parse";
import { mediaPool } from "@/services/media/pool";
import { blobRepo } from "@/services/project/db";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";
import { uid } from "@/utils/format";

export function useMediaImport() {
  const addAssets = useProjectStore((s) => s.addAssets);

  const importFiles = useCallback(
    async (files: File[]): Promise<MediaAsset[]> => {
      const ui = useUiStore.getState();
      const projectId = useProjectStore.getState().project.id;
      const accepted = files.filter((f) => kindOf(f) !== null);
      const rejected = files.filter((f) => kindOf(f) === null);
      for (const f of rejected) {
        ui.notify({ text: `Nieobsługiwany format: ${f.name}`, tone: "error" });
      }
      if (!accepted.length) return [];

      const imported: MediaAsset[] = [];
      for (const file of accepted) {
        const taskId = ui.startImport(file.name);
        try {
          ui.updateImport(taskId, { progress: 0.1, stage: "Analiza" });
          let asset: MediaAsset;
          if (kindOf(file) === "subtitle") {
            const text = await file.text();
            const { cues, format } = parseSubtitles(text);
            if (!cues.length) throw new Error("Plik napisów nie zawiera poprawnych wpisów.");
            const sub: SubtitleAsset = {
              id: uid("sub"),
              name: file.name.replace(/\.[^.]+$/, ""),
              kind: "subtitle",
              fileName: file.name,
              mimeType: format === "vtt" ? "text/vtt" : "application/x-subrip",
              size: file.size,
              importedAt: Date.now(),
              format,
              cues,
              duration: cues[cues.length - 1]?.end ?? 0,
            };
            asset = sub;
          } else {
            const outcome = await probeMediaFile(file, (stage) =>
              ui.updateImport(taskId, { stage, progress: 0.45 }),
            );
            asset = outcome.asset;
            mediaPool.register(asset.id, file);
            for (const w of outcome.warnings) ui.notify({ text: w, tone: "error", duration: 9000 });
          }

          ui.updateImport(taskId, { progress: 0.8, stage: "Zapis w projekcie" });
          if (asset.kind !== "subtitle") {
            try {
              await blobRepo.put({
                id: asset.id,
                projectId,
                fileName: file.name,
                type: file.type,
                blob: file,
              });
            } catch (err) {
              const msg = (err as Error).name === "QuotaExceededError"
                ? `Brak miejsca w pamięci przeglądarki — ${file.name} nie zostanie zapamiętany po odświeżeniu.`
                : `Nie udało się zapisać ${file.name} w bazie projektu.`;
              ui.notify({ text: msg, tone: "error" });
            }
          }
          imported.push(asset);
          ui.updateImport(taskId, { progress: 1, stage: "Gotowe", done: true });
        } catch (err) {
          ui.updateImport(taskId, {
            progress: 1,
            stage: "Błąd",
            done: true,
            error: (err as Error).message,
          });
          ui.notify({ text: `${file.name}: ${(err as Error).message}`, tone: "error" });
        }
      }

      if (imported.length) {
        addAssets(imported);
        ui.notify(`Zaimportowano ${imported.length} ${imported.length === 1 ? "plik" : "plików"}.`);
      }
      window.setTimeout(() => {
        const stillRunning = useUiStore.getState().imports.some((t) => !t.done);
        if (!stillRunning) useUiStore.getState().clearImports();
      }, 1400);
      return imported;
    },
    [addAssets],
  );

  const pickFiles = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ACCEPT_ATTRIBUTE;
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length) void importFiles(files);
    };
    input.click();
  }, [importFiles]);

  return { importFiles, pickFiles, extOf };
}
