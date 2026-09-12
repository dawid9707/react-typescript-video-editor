import { create } from "zustand";
import type { AppSettings } from "@/types";
import { defaultSettings, loadSettings, saveSettings } from "@/services/project/db";
import { applyTheme } from "@/theme/palette";

interface SettingsState extends AppSettings {
  set: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  reset: () => void;
}

const initial = loadSettings();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...initial,
  set: (key, value) => {
    set({ [key]: value } as unknown as Partial<SettingsState>);
    const { set: _set, reset: _reset, ...rest } = get();
    const next = { ...rest, [key]: value } as AppSettings;
    saveSettings(next);
    if (key === "theme" || key === "accent") applyTheme(next.theme, next.accent);
  },
  reset: () => {
    set({ ...defaultSettings });
    saveSettings(defaultSettings);
    applyTheme(defaultSettings.theme, defaultSettings.accent);
  },
}));
