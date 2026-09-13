import { useEffect, useState, useCallback } from "react";
import { Dialog, Button, EmptyState, Icon, IconButton, LinearProgress, TextField } from "@/components/ui";
import { useUiStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import {
  signInWithGoogleDrive,
  signOutGoogleDrive,
  getGoogleAccessToken,
  initGoogleAuth,
  listDriveProjects,
  saveProjectToDrive,
  loadProjectFromDrive,
  DriveFileItem,
} from "@/services/googleDriveService";
import type { User } from "firebase/auth";

export function GoogleDriveDialog() {
  const open = useUiStore((s) => s.dialog) === "googleDrive";
  const close = useUiStore((s) => s.closeDialog);
  const notify = useUiStore((s) => s.notify);

  const project = useProjectStore((s) => s.project);
  const openProjectJson = useProjectStore((s) => s.openProjectJson);

  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(getGoogleAccessToken());
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [saveFileName, setSaveFileName] = useState(project.name || "MójProjekt");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
      },
      () => {
        setUser(null);
        setToken(null);
      },
    );
    return () => unsubscribe();
  }, []);

  const fetchFiles = useCallback(async (accessToken: string) => {
    try {
      setLoading(true);
      const list = await listDriveProjects(accessToken);
      setFiles(list);
    } catch (err: any) {
      notify({ text: err.message || "Błąd listowania plików z Google Drive", tone: "error" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (open && token) {
      void fetchFiles(token);
    }
  }, [open, token, fetchFiles]);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      const res = await signInWithGoogleDrive();
      setUser(res.user);
      setToken(res.accessToken);
      notify("Zalogowano pomyślnie do Google Drive.");
      void fetchFiles(res.accessToken);
    } catch (err: any) {
      notify({ text: err.message || "Logowanie do Google Drive nie powiodło się", tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOutGoogleDrive();
    setUser(null);
    setToken(null);
    setFiles([]);
    notify("Wylogowano z Google Drive.");
  };

  const handleSave = async () => {
    if (!token) return;
    try {
      setSaving(true);
      const projectJson = JSON.stringify(project, null, 2);
      await saveProjectToDrive(token, saveFileName, projectJson);
      notify("Projekt zapisany w Google Drive!");
      void fetchFiles(token);
    } catch (err: any) {
      notify({ text: err.message || "Nie udało się zapisać projektu", tone: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (fileId: string) => {
    if (!token) return;
    try {
      setLoading(true);
      const json = await loadProjectFromDrive(token, fileId);
      openProjectJson(json);
      notify("Projekt wczytany z Google Drive!");
      close();
    } catch (err: any) {
      notify({ text: err.message || "Nie udało się wczytać projektu", tone: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Google Drive – Projekty"
      icon="cloud"
      size="md"
      actions={<Button onClick={close}>Zamknij</Button>}
    >
      {!token ? (
        <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="cloud_sync" size={32} />
          </div>
          <div>
            <h3 className="text-[16px] font-medium text-on-surface">Połącz z Google Drive</h3>
            <p className="mt-1 text-[13px] text-on-surface-variant max-w-[360px]">
              Zapisuj i wczytuj swoje projekty wideo bezpośrednio ze swojego dysku Google.
            </p>
          </div>
          <Button onClick={handleSignIn} disabled={loading} icon="login">
            {loading ? "Logowanie..." : "Zaloguj się przez Google"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between rounded-[12px] bg-surf p-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-container text-on-primary-container font-bold text-[14px]">
                {user?.displayName?.[0] || user?.email?.[0] || "G"}
              </span>
              <div>
                <p className="text-[13px] font-medium text-on-surface">{user?.displayName || user?.email || "Użytkownik"}</p>
                <p className="text-[11px] text-on-surface-variant">Połączono z Google Drive</p>
              </div>
            </div>
            <Button variant="text" onClick={handleSignOut} icon="logout">
              Wyloguj
            </Button>
          </div>

          <div className="flex flex-col gap-2 rounded-[12px] bg-surf-high p-3">
            <p className="text-[13px] font-medium text-on-surface">Zapisz bieżący projekt</p>
            <div className="flex gap-2">
              <TextField
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="Nazwa pliku na Drive"
                className="flex-1"
              />
              <Button onClick={handleSave} disabled={saving} icon="cloud_upload">
                {saving ? "Zapisywanie..." : "Zapisz"}
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-on-surface">Twoje projekty w Google Drive</p>
              <IconButton icon="refresh" label="Odśwież" onClick={() => token && void fetchFiles(token)} />
            </div>

            {loading && <LinearProgress indeterminate className="w-full" />}

            {!loading && files.length === 0 ? (
              <EmptyState
                compact
                icon="folder_off"
                title="Brak projektów na Google Drive"
                description="Zapisz swój pierwszy projekt powyżej."
              />
            ) : (
              <div className="max-h-[260px] overflow-y-auto flex flex-col gap-2 pr-1">
                {files.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 rounded-[12px] bg-surf p-3">
                    <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-primary-container text-on-primary-container">
                      <Icon name="description" size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-on-surface">{file.name}</p>
                      <p className="text-[11px] text-on-surface-variant">
                        Zmodyfikowano: {new Date(file.modifiedTime).toLocaleString("pl-PL")}
                      </p>
                    </div>
                    <Button
                      variant="tonal"
                      onClick={() => void handleLoad(file.id)}
                    >
                      Otwórz
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
