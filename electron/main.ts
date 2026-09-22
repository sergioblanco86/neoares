import { app, BrowserWindow, ipcMain, Menu } from "electron";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import { hasInternetConnection } from "./connectivity";
import { DjRepository } from "./dj-repository";
import { SourceService } from "./source-service";
import type { DjProfile, SourceRequestScope, YouTubeSource } from "../src/shared/contracts";

process.title = "NeoAres";
app.name = "NeoAres";

let mainWindow: BrowserWindow | null = null;
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const legacyUserDataPath = path.join(app.getPath("appData"), "youtubeshuffle");
const neoAresUserDataPath = path.join(app.getPath("appData"), "NeoAres");
app.setPath("userData", neoAresUserDataPath);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1040,
    minHeight: 720,
    title: "NeoAres",
    backgroundColor: "#101114",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) {
    void mainWindow.loadURL(developmentUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

function configureApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "NeoAres",
      submenu: [
        { label: "Acerca de NeoAres", role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { label: "Ocultar NeoAres", role: "hide" },
        { label: "Ocultar las demás", role: "hideOthers" },
        { label: "Mostrar todo", role: "unhide" },
        { type: "separator" },
        { label: "Salir de NeoAres", role: "quit" },
      ],
    },
    { label: "Archivo", role: "fileMenu" },
    { label: "Edición", role: "editMenu" },
    { label: "Visualización", role: "viewMenu" },
    { label: "Ventana", role: "windowMenu" },
  ]));
}

if (!hasSingleInstanceLock) {
  app.quit();
} else app.whenReady().then(() => {
  configureApplicationMenu();
  return migrateLegacyProfiles();
}).then(() => {
  const repository = new DjRepository(path.join(app.getPath("userData"), "data"));
  const sources = new SourceService(path.join(app.getPath("userData"), "cache", "sources"));

  ipcMain.handle(IPC_CHANNELS.listDjs, () => repository.list());
  ipcMain.handle(IPC_CHANNELS.saveDj, (_event, profile: DjProfile) => repository.save(profile));
  ipcMain.handle(IPC_CHANNELS.deleteDj, (_event, id: string) => repository.delete(id));
  ipcMain.handle(IPC_CHANNELS.checkConnectivity, () => hasInternetConnection());
  ipcMain.handle(IPC_CHANNELS.setAudioActive, (event, active: boolean) => {
    event.sender.setBackgroundThrottling(!(active === true));
  });
  ipcMain.handle(IPC_CHANNELS.searchSources, (_event, query: string, limit: number, scope?: SourceRequestScope) => sources.search(query, limit, scope));
  ipcMain.handle(IPC_CHANNELS.searchManySources, (_event, queries: string[], limitPerQuery: number, scope?: SourceRequestScope) => sources.searchMany(queries, limitPerQuery, scope));
  ipcMain.handle(IPC_CHANNELS.inspectSource, (_event, url: string, scope?: SourceRequestScope) => sources.inspect(url, scope));
  ipcMain.handle(IPC_CHANNELS.prepareSource, (_event, source: YouTubeSource, scope?: SourceRequestScope) => sources.prepare(source, scope));
  ipcMain.handle(IPC_CHANNELS.readSource, (_event, leaseId: string) => sources.read(leaseId));
  ipcMain.handle(IPC_CHANNELS.releaseSource, (_event, leaseId: string) => sources.release(leaseId));
  ipcMain.handle(IPC_CHANNELS.cancelPlaybackSources, () => sources.cancelPlayback());

  app.on("before-quit", () => sources.cancelAll());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

async function migrateLegacyProfiles(): Promise<void> {
  const legacyDataPath = path.join(legacyUserDataPath, "data");
  const neoAresDataPath = path.join(neoAresUserDataPath, "data");
  try {
    await access(neoAresDataPath);
    return;
  } catch {
    // Continue only when the new brand has not created its own data yet.
  }
  try {
    await access(legacyDataPath);
    await mkdir(neoAresUserDataPath, { recursive: true });
    await cp(legacyDataPath, neoAresDataPath, { recursive: true, errorOnExist: false });
  } catch {
    // A first launch without legacy data starts with an empty DJ library.
  }
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
