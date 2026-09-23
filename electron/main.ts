import { app, BrowserWindow, ipcMain, Menu, powerMonitor } from "electron";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import { hasInternetConnection } from "./connectivity";
import { DjRepository } from "./dj-repository";
import { SourceService } from "./source-service";
import { AppStateRepository, SessionRepository } from "./state-repository";
import { MediaCache } from "./media-cache";
import { MusicSourceService } from "./music-source-service";
import { resolveLocale } from "../src/i18n/locale";
import type { AppState, CachePolicy, DjProfile, LoudnessAnalysis, PopularityLevel, SessionSnapshot, SourceRequestScope, SupportedLocale, YouTubeSource } from "../src/shared/contracts";

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

function configureApplicationMenu(locale: SupportedLocale): void {
  const copy = locale === "es" ? {
    about: "Acerca de NeoAres",
    services: "Servicios",
    hide: "Ocultar NeoAres",
    hideOthers: "Ocultar las demás",
    showAll: "Mostrar todo",
    quit: "Salir de NeoAres",
    file: "Archivo",
    close: "Cerrar ventana",
    edit: "Edición",
    undo: "Deshacer",
    redo: "Rehacer",
    cut: "Cortar",
    copy: "Copiar",
    paste: "Pegar",
    selectAll: "Seleccionar todo",
    view: "Visualización",
    reload: "Recargar",
    forceReload: "Forzar recarga",
    developerTools: "Herramientas de desarrollo",
    actualSize: "Tamaño real",
    zoomIn: "Ampliar",
    zoomOut: "Reducir",
    fullscreen: "Pantalla completa",
    window: "Ventana",
    minimize: "Minimizar",
    zoom: "Zoom",
    front: "Traer todo al frente",
  } : {
    about: "About NeoAres",
    services: "Services",
    hide: "Hide NeoAres",
    hideOthers: "Hide Others",
    showAll: "Show All",
    quit: "Quit NeoAres",
    file: "File",
    close: "Close Window",
    edit: "Edit",
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    view: "View",
    reload: "Reload",
    forceReload: "Force Reload",
    developerTools: "Developer Tools",
    actualSize: "Actual Size",
    zoomIn: "Zoom In",
    zoomOut: "Zoom Out",
    fullscreen: "Toggle Full Screen",
    window: "Window",
    minimize: "Minimize",
    zoom: "Zoom",
    front: "Bring All to Front",
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "NeoAres",
      submenu: [
        { label: copy.about, role: "about" },
        { type: "separator" },
        { label: copy.services, role: "services" },
        { type: "separator" },
        { label: copy.hide, role: "hide" },
        { label: copy.hideOthers, role: "hideOthers" },
        { label: copy.showAll, role: "unhide" },
        { type: "separator" },
        { label: copy.quit, role: "quit" },
      ],
    },
    { label: copy.file, submenu: [{ label: copy.close, role: "close" }] },
    { label: copy.edit, submenu: [
      { label: copy.undo, role: "undo" },
      { label: copy.redo, role: "redo" },
      { type: "separator" },
      { label: copy.cut, role: "cut" },
      { label: copy.copy, role: "copy" },
      { label: copy.paste, role: "paste" },
      { label: copy.selectAll, role: "selectAll" },
    ] },
    { label: copy.view, submenu: [
      { label: copy.reload, role: "reload" },
      { label: copy.forceReload, role: "forceReload" },
      { label: copy.developerTools, role: "toggleDevTools" },
      { type: "separator" },
      { label: copy.actualSize, role: "resetZoom" },
      { label: copy.zoomIn, role: "zoomIn" },
      { label: copy.zoomOut, role: "zoomOut" },
      { type: "separator" },
      { label: copy.fullscreen, role: "togglefullscreen" },
    ] },
    { label: copy.window, submenu: [
      { label: copy.minimize, role: "minimize" },
      { label: copy.zoom, role: "zoom" },
      { type: "separator" },
      { label: copy.front, role: "front" },
    ] },
  ]));
}

if (!hasSingleInstanceLock) {
  app.quit();
} else app.whenReady().then(() => {
  return migrateLegacyProfiles();
}).then(async () => {
  const userDataPath = app.getPath("userData");
  const dataPath = path.join(userDataPath, "data");
  const repository = new DjRepository(dataPath);
  const appStateRepository = new AppStateRepository(dataPath);
  const sessionRepository = new SessionRepository(dataPath);
  const mediaCache = new MediaCache(userDataPath, [
    path.join(userDataPath, "cache", "sources"),
    path.join(legacyUserDataPath, "Cache", "sources"),
  ]);
  const savedSession = await sessionRepository.loadActive();
  mediaCache.protect(savedSession ? protectedSessionSourceIds(savedSession) : []);
  await mediaCache.initialize();
  const sources = new SourceService(mediaCache.audioDirectory, undefined, mediaCache);
  const musicSources = new MusicSourceService();

  const initialAppState = await appStateRepository.load();
  configureApplicationMenu(resolveLocale(initialAppState.languagePreference, app.getPreferredSystemLanguages()));

  ipcMain.handle(IPC_CHANNELS.getPreferredLanguages, () => app.getPreferredSystemLanguages());
  ipcMain.handle(IPC_CHANNELS.applyLocale, (_event, locale: SupportedLocale) => {
    if (locale !== "es" && locale !== "en") throw new Error("LOCALE_UNSUPPORTED");
    configureApplicationMenu(locale);
  });
  ipcMain.handle(IPC_CHANNELS.listDjs, () => repository.list());
  ipcMain.handle(IPC_CHANNELS.saveDj, (_event, profile: DjProfile) => repository.save(profile));
  ipcMain.handle(IPC_CHANNELS.deleteDj, (_event, id: string) => repository.delete(id));
  ipcMain.handle(IPC_CHANNELS.loadAppState, () => appStateRepository.load());
  ipcMain.handle(IPC_CHANNELS.saveAppState, (_event, state: AppState) => appStateRepository.save(state));
  ipcMain.handle(IPC_CHANNELS.loadActiveSession, () => sessionRepository.loadActive());
  ipcMain.handle(IPC_CHANNELS.saveActiveSession, async (_event, snapshot: SessionSnapshot) => {
    await sessionRepository.saveActive(snapshot);
    mediaCache.protect(protectedSessionSourceIds(snapshot));
  });
  ipcMain.handle(IPC_CHANNELS.clearActiveSession, async () => {
    await sessionRepository.clearActive();
    mediaCache.protect([]);
  });
  ipcMain.handle(IPC_CHANNELS.getCacheStats, () => mediaCache.getStats());
  ipcMain.handle(IPC_CHANNELS.getCachePolicy, () => mediaCache.getPolicy());
  ipcMain.handle(IPC_CHANNELS.saveCachePolicy, (_event, policy: CachePolicy) => mediaCache.savePolicy(policy));
  ipcMain.handle(IPC_CHANNELS.cleanupCache, () => mediaCache.cleanup());
  ipcMain.handle(IPC_CHANNELS.clearUnusedCache, () => mediaCache.clearUnused());
  ipcMain.handle(IPC_CHANNELS.protectCacheSources, (_event, sourceIds: string[]) => mediaCache.protect(sourceIds));
  ipcMain.handle(IPC_CHANNELS.getCachedLoudness, (_event, sourceId: string) => mediaCache.getLoudness(sourceId));
  ipcMain.handle(IPC_CHANNELS.saveCachedLoudness, (_event, sourceId: string, analysis: LoudnessAnalysis) => mediaCache.saveLoudness(sourceId, analysis));
  ipcMain.handle(IPC_CHANNELS.checkConnectivity, () => hasInternetConnection());
  ipcMain.handle(IPC_CHANNELS.setAudioActive, (event, active: boolean) => {
    event.sender.setBackgroundThrottling(!(active === true));
  });
  ipcMain.handle(IPC_CHANNELS.searchSources, (_event, query: string, limit: number, scope?: SourceRequestScope) => sources.search(query, limit, scope));
  ipcMain.handle(IPC_CHANNELS.searchManySources, (_event, queries: string[], limitPerQuery: number, scope?: SourceRequestScope) => sources.searchMany(queries, limitPerQuery, scope));
  ipcMain.handle(IPC_CHANNELS.searchManyMusicSources, (_event, queries: string[], limitPerQuery: number, popularityLevel: PopularityLevel, scope?: SourceRequestScope) => musicSources.searchMany(queries, limitPerQuery, popularityLevel, scope));
  ipcMain.handle(IPC_CHANNELS.inspectSource, (_event, url: string, scope?: SourceRequestScope) => sources.inspect(url, scope));
  ipcMain.handle(IPC_CHANNELS.prepareSource, (_event, source: YouTubeSource, scope?: SourceRequestScope) => sources.prepare(source, scope));
  ipcMain.handle(IPC_CHANNELS.readSource, (_event, leaseId: string) => sources.read(leaseId));
  ipcMain.handle(IPC_CHANNELS.releaseSource, (_event, leaseId: string) => sources.release(leaseId));
  ipcMain.handle(IPC_CHANNELS.cancelPlaybackSources, () => sources.cancelPlayback());

  const sweepTimer = setInterval(() => {
    void mediaCache.cleanup().catch((cause) => console.warn("[cache] periodic-cleanup-failed", cause));
  }, mediaCache.getPolicy().sweepIntervalMinutes * 60 * 1_000);
  sweepTimer.unref();
  const cleanupAfterResume = () => {
    void mediaCache.cleanup().catch((cause) => console.warn("[cache] resume-cleanup-failed", cause));
  };
  powerMonitor.on("resume", cleanupAfterResume);

  app.on("before-quit", () => {
    clearInterval(sweepTimer);
    powerMonitor.removeListener("resume", cleanupAfterResume);
    sources.cancelAll();
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

function protectedSessionSourceIds(snapshot: SessionSnapshot): string[] {
  return snapshot.queue
    .slice(snapshot.currentIndex, snapshot.currentIndex + 2)
    .map(({ id }) => id);
}

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
