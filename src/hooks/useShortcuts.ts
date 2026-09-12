import { useEffect } from "react";
import { playbackEngine } from "@/services/playback/engine";
import { useProjectStore } from "@/stores/projectStore";
import { useUiStore } from "@/stores/uiStore";

const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable;
};

export function useShortcuts(): void {
  useEffect(() => {
    let shuttleRate = 1;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const project = useProjectStore.getState();
      const ui = useUiStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const fps = project.project.settings.fps || 30;
      const selection = ui.selectedClipIds;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        project.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        if (selection.length) {
          e.preventDefault();
          project.copyClips(selection);
          ui.notify(`Skopiowano ${selection.length} klip(y).`);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const created = project.pasteClips(playbackEngine.time);
        if (created.length) ui.select(created);
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (selection.length) {
          e.preventDefault();
          ui.select(project.duplicateClips(selection));
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        ui.select(project.project.clips.map((c) => c.id));
        return;
      }
      if (mod) return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          playbackEngine.toggle();
          break;
        case "Delete":
        case "Backspace":
          if (selection.length) {
            e.preventDefault();
            project.deleteClips(selection);
            ui.clearSelection();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          playbackEngine.seek(Math.max(0, playbackEngine.time - (e.shiftKey ? 1 : 1 / fps)));
          break;
        case "ArrowRight":
          e.preventDefault();
          playbackEngine.seek(playbackEngine.time + (e.shiftKey ? 1 : 1 / fps));
          break;
        case "Home":
          e.preventDefault();
          playbackEngine.seek(0);
          break;
        case "End":
          e.preventDefault();
          playbackEngine.seek(playbackEngine.duration());
          break;
        case "Escape":
          ui.clearSelection();
          break;
        default:
          break;
      }

      const key = e.key.toLowerCase();
      if (key === "s") {
        const targets = selection.length
          ? selection
          : project.project.clips
              .filter((c) => playbackEngine.time > c.start && playbackEngine.time < c.start + c.duration)
              .map((c) => c.id);
        if (targets.length) {
          const created = project.splitClips(targets, playbackEngine.time);
          if (created.length) ui.notify(`Podzielono ${created.length} klip(y).`);
        }
      }
      if (key === "m") {
        project.addMarker(playbackEngine.time);
        ui.notify("Dodano marker.");
      }
      if (key === "j") {
        shuttleRate = playbackEngine.rate < 0.5 ? 0.25 : 0.5;
        playbackEngine.setRate(shuttleRate);
        playbackEngine.seek(Math.max(0, playbackEngine.time - 1));
        ui.notify("Przewijanie wstecz (J)");
      }
      if (key === "k") {
        playbackEngine.pause();
        playbackEngine.setRate(1);
      }
      if (key === "l") {
        shuttleRate = playbackEngine.playing ? Math.min(4, playbackEngine.rate * 2) : 1;
        playbackEngine.setRate(shuttleRate);
        void playbackEngine.play();
      }
      if (key === "v") ui.setTool("select");
      if (key === "b" || key === "c") ui.setTool("razor");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
