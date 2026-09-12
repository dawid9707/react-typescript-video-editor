import { openDB, type IDBPDatabase } from "idb";
import type { AppSettings, Project } from "@/types";

const DB_NAME = "material-video-studio";
const DB_VERSION = 1;
const STORE_PROJECTS = "projects";
const STORE_BLOBS = "blobs";
const STORE_RECOVERY = "recovery";

export interface StoredBlob {
  id: string;
  projectId: string;
  fileName: string;
  type: string;
  blob: Blob;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_PROJECTS)) {
          database.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains(STORE_BLOBS)) {
          const store = database.createObjectStore(STORE_BLOBS, { keyPath: "id" });
          store.createIndex("projectId", "projectId");
        }
        if (!database.objectStoreNames.contains(STORE_RECOVERY)) {
          database.createObjectStore(STORE_RECOVERY, { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

export const projectRepo = {
  async list(): Promise<Project[]> {
    const all = (await (await db()).getAll(STORE_PROJECTS)) as Project[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async get(id: string): Promise<Project | undefined> {
    return (await (await db()).get(STORE_PROJECTS, id)) as Project | undefined;
  },
  async save(project: Project): Promise<void> {
    await (await db()).put(STORE_PROJECTS, { ...project, updatedAt: Date.now() });
  },
  async remove(id: string): Promise<void> {
    const database = await db();
    await database.delete(STORE_PROJECTS, id);
    const keys = await database.getAllKeysFromIndex(STORE_BLOBS, "projectId", id);
    await Promise.all(keys.map((k) => database.delete(STORE_BLOBS, k)));
  },
};

export const blobRepo = {
  async put(entry: StoredBlob): Promise<void> {
    await (await db()).put(STORE_BLOBS, entry);
  },
  async get(id: string): Promise<StoredBlob | undefined> {
    return (await (await db()).get(STORE_BLOBS, id)) as StoredBlob | undefined;
  },
  async forProject(projectId: string): Promise<StoredBlob[]> {
    return (await (await db()).getAllFromIndex(STORE_BLOBS, "projectId", projectId)) as StoredBlob[];
  },
  async remove(id: string): Promise<void> {
    await (await db()).delete(STORE_BLOBS, id);
  },
};

export const recoveryRepo = {
  async write(project: Project): Promise<void> {
    await (await db()).put(STORE_RECOVERY, { id: "latest", savedAt: Date.now(), project });
  },
  async read(): Promise<{ savedAt: number; project: Project } | undefined> {
    return (await (await db()).get(STORE_RECOVERY, "latest")) as
      | { savedAt: number; project: Project }
      | undefined;
  },
  async clear(): Promise<void> {
    await (await db()).delete(STORE_RECOVERY, "latest");
  },
};

/* --------------------------- app settings --------------------------- */

const SETTINGS_KEY = "mvs.settings.v1";

export const defaultSettings: AppSettings = {
  theme: "system",
  accent: "#4a5bb9",
  snapping: true,
  autoSave: true,
  showWaveforms: true,
  timelineZoom: 60,
  backendUrl: "",
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked — settings stay in memory only */
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
}
