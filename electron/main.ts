import { app, BrowserWindow, globalShortcut, ipcMain, Menu, powerMonitor } from "electron";
import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS } from "./channels";
import { hasInternetConnection } from "./connectivity";
import { DjRepository } from "./dj-repository";
import { SourceService } from "./source-service";
import { AppStateRepository, SessionRepository } from "./state-repository";
import { MediaCache } from "./media-cache";
import { MusicSourceService } from "./music-source-service";
import { VisualizerPresentationRepository, VisualizerPresetLibrary, VisualizerSettingsRepository } from "./visualizer-repository";
import { resolveLocale } from "../src/i18n/locale";
import { playbackRetention } from "../src/domain/playback-retention";
import { EqualizerRepository } from "./equalizer-repository";
import { NativeVisualizerHost } from "./native-visualizer";
import type { EqualizerSettings } from "../src/shared/contracts";
import type { AppState, CachePolicy, DjProfile, LoudnessAnalysis, MediaControlCommand, PopularityLevel, SessionSnapshot, SourceRequestScope, SupportedLocale, VisualizerPresetImportRequest, VisualizerPresentation, VisualizerSettings, YouTubeSource } from "../src/shared/contracts";

process.title = "NeoAres";
app.name = "NeoAres";

let mainWindow: BrowserWindow | null = null;
let nativeVisualizer: NativeVisualizerHost | null = null;
const visualReadWriteChannels: Set<string> = new Set([
  IPC_CHANNELS.getPreferredLanguages, IPC_CHANNELS.loadAppState, IPC_CHANNELS.getWindowVisibility,
  IPC_CHANNELS.loadVisualizerSettings, IPC_CHANNELS.saveVisualizerSettings,
  IPC_CHANNELS.loadVisualizerPresentation, IPC_CHANNELS.saveVisualizerPresentation,
  IPC_CHANNELS.listVisualizerPresets, IPC_CHANNELS.loadVisualizerPresetDefinition,
  IPC_CHANNELS.importVisualizerPresets, IPC_CHANNELS.removeVisualizerPreset,
  IPC_CHANNELS.retryVisualizerPreset, IPC_CHANNELS.setVisualizerPresetFavorite,
]);
function registerHandler(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, (event, ...args) => {
    const owner = event.sender === mainWindow?.webContents;
    const visual = event.sender === nativeVisualizer?.window?.webContents;
    if (event.senderFrame !== event.sender.mainFrame || (!owner && !(visual && visualReadWriteChannels.has(channel)))) throw new Error("IPC_ROLE_DENIED");
    return listener(event, ...args);
  });
}
let activeSources: SourceService | null = null;
const registeredMediaAccelerators = new Set<string>();
const hasSingleInstanceLock = app.requestSingleInstanceLock();
const legacyUserDataPath = path.join(app.getPath("appData"), "youtubeshuffle");
const neoAresUserDataPath = path.join(app.getPath("appData"), "NeoAres");
app.setPath("userData", neoAresUserDataPath);

function createWindow(sources: SourceService): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 360,
    minHeight: 360,
    useContentSize: true,
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

  const createdWindow = mainWindow;
  const [outerWidth, outerHeight] = createdWindow.getSize();
  const [contentWidth, contentHeight] = createdWindow.getContentSize();
  createdWindow.setMinimumSize(360 + outerWidth - contentWidth, 360 + outerHeight - contentHeight);
  createdWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  createdWindow.webContents.on("will-navigate", (event, url) => { if (url !== createdWindow.webContents.getURL()) event.preventDefault(); });
  nativeVisualizer = new NativeVisualizerHost(createdWindow, path.join(app.getPath("userData"), "data"), path.join(__dirname, "preload.cjs"), process.env.VITE_DEV_SERVER_URL ?? path.join(__dirname, "../dist/index.html"), Boolean(process.env.VITE_DEV_SERVER_URL));
  createdWindow.webContents.once("destroyed", () => {
    sources.cancelAll();
    sources.releaseAllLeases();
  });
  const reportVisibility = () => {
    if (!createdWindow.isDestroyed()) createdWindow.webContents.send(IPC_CHANNELS.windowVisibility, createdWindow.isVisible() && !createdWindow.isMinimized());
  };
  createdWindow.on("show", reportVisibility);
  createdWindow.on("hide", reportVisibility);
  createdWindow.on("minimize", reportVisibility);
  createdWindow.on("restore", reportVisibility);

  mainWindow.once("ready-to-show", () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

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
  const visualizerSettings = new VisualizerSettingsRepository(dataPath);
  const equalizer = new EqualizerRepository(dataPath);
  const visualizerPresentation = new VisualizerPresentationRepository(dataPath);
  const visualizerLibrary = new VisualizerPresetLibrary(dataPath);
  const mediaCache = new MediaCache(userDataPath, [
    path.join(userDataPath, "cache", "sources"),
    path.join(legacyUserDataPath, "Cache", "sources"),
  ]);
  const savedSession = await sessionRepository.loadActive();
  mediaCache.protect(savedSession ? protectedSessionSourceIds(savedSession) : []);
  await mediaCache.initialize();
  if (savedSession) await mediaCache.retainSession(savedSession).catch(cause => console.warn("[cache] startup-collection-failed", cause));
  const sources = new SourceService(mediaCache.audioDirectory, undefined, mediaCache);
  activeSources = sources;
  const musicSources = new MusicSourceService();

  const initialAppState = await appStateRepository.load();
  let visualizerLocale = resolveLocale(initialAppState.languagePreference, app.getPreferredSystemLanguages());
  configureApplicationMenu(visualizerLocale);

  registerHandler(IPC_CHANNELS.getPreferredLanguages, () => app.getPreferredSystemLanguages());
  registerHandler(IPC_CHANNELS.applyLocale, (_event, locale: SupportedLocale) => {
    if (locale !== "es" && locale !== "en") throw new Error("LOCALE_UNSUPPORTED");
    visualizerLocale = locale;
    configureApplicationMenu(locale);
  });
  registerHandler(IPC_CHANNELS.listDjs, () => repository.list());
  registerHandler(IPC_CHANNELS.saveDj, (_event, profile: DjProfile) => repository.save(profile));
  registerHandler(IPC_CHANNELS.deleteDj, (_event, id: string) => repository.delete(id));
  registerHandler(IPC_CHANNELS.loadAppState, () => appStateRepository.load());
  registerHandler(IPC_CHANNELS.saveAppState, (_event, state: AppState) => appStateRepository.save(state));
  registerHandler(IPC_CHANNELS.loadActiveSession, () => sessionRepository.loadActive());
  registerHandler(IPC_CHANNELS.saveActiveSession, async (_event, snapshot: SessionSnapshot) => {
    await sessionRepository.saveActive(snapshot);
    await mediaCache.retainSession(snapshot).catch(cause => console.warn("[cache] session-collection-failed", cause));
  });
  registerHandler(IPC_CHANNELS.clearActiveSession, async () => {
    await sessionRepository.clearActive();
    mediaCache.protect([]);
  });
  registerHandler(IPC_CHANNELS.getCacheStats, () => mediaCache.getStats());
  registerHandler(IPC_CHANNELS.getCachePolicy, () => mediaCache.getPolicy());
  registerHandler(IPC_CHANNELS.saveCachePolicy, (_event, policy: CachePolicy) => mediaCache.savePolicy(policy));
  registerHandler(IPC_CHANNELS.cleanupCache, () => mediaCache.cleanup());
  registerHandler(IPC_CHANNELS.clearUnusedCache, () => mediaCache.clearUnused());
  registerHandler(IPC_CHANNELS.protectCacheSources, (_event, sourceIds: string[]) => mediaCache.protect(sourceIds));
  registerHandler(IPC_CHANNELS.getCachedLoudness, (_event, sourceId: string) => mediaCache.getLoudness(sourceId));
  registerHandler(IPC_CHANNELS.saveCachedLoudness, (_event, sourceId: string, analysis: LoudnessAnalysis) => mediaCache.saveLoudness(sourceId, analysis));
  registerHandler(IPC_CHANNELS.loadVisualizerSettings, () => visualizerSettings.load());
  registerHandler(IPC_CHANNELS.loadEqualizerSettings, () => equalizer.load());
  registerHandler(IPC_CHANNELS.saveEqualizerSettings, (_event, settings: EqualizerSettings) => equalizer.save(settings));
  registerHandler(IPC_CHANNELS.saveVisualizerSettings, (_event, settings: VisualizerSettings) => visualizerSettings.save(settings));
  registerHandler(IPC_CHANNELS.loadVisualizerPresentation, () => visualizerPresentation.load());
  registerHandler(IPC_CHANNELS.saveVisualizerPresentation, (_event, presentation: VisualizerPresentation) => visualizerPresentation.save(presentation));
  registerHandler(IPC_CHANNELS.listVisualizerPresets, () => visualizerLibrary.list());
  registerHandler(IPC_CHANNELS.loadVisualizerPresetDefinition, (_event, id: string) => visualizerLibrary.loadDefinition(id));
  registerHandler(IPC_CHANNELS.importVisualizerPresets, (event, request: VisualizerPresetImportRequest) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    if (!parent || (parent !== mainWindow && parent !== nativeVisualizer?.window)) throw new Error("VISUALIZER_IMPORT_UNAVAILABLE");
    if (request?.mode !== "files" && request?.mode !== "directory") throw new Error("VISUALIZER_IMPORT_INVALID_REQUEST");
    return visualizerLibrary.importFromDialog(parent, request, visualizerLocale);
  });
  registerHandler(IPC_CHANNELS.removeVisualizerPreset, (_event, id: string) => visualizerLibrary.remove(id));
  registerHandler(IPC_CHANNELS.retryVisualizerPreset, (_event, id: string) => visualizerLibrary.retry(id));
  registerHandler(IPC_CHANNELS.setVisualizerPresetFavorite, (_event, id: string, favorite: boolean) => visualizerLibrary.setFavorite(id, favorite));
  registerHandler(IPC_CHANNELS.checkConnectivity, () => hasInternetConnection());
  registerHandler(IPC_CHANNELS.getWindowVisibility, event => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    return Boolean(owner && owner.isVisible() && !owner.isMinimized());
  });
  registerHandler(IPC_CHANNELS.setAudioActive, (event, active: boolean) => {
    event.sender.setBackgroundThrottling(!(active === true));
  });
  registerHandler(IPC_CHANNELS.setMediaControlsActive, (_event, active: boolean) => {
    setGlobalMediaControlsActive(active === true);
  });
  registerHandler(IPC_CHANNELS.searchSources, (_event, query: string, limit: number, scope?: SourceRequestScope) => sources.search(query, limit, scope));
  registerHandler(IPC_CHANNELS.searchManySources, (_event, queries: string[], limitPerQuery: number, scope?: SourceRequestScope) => sources.searchMany(queries, limitPerQuery, scope));
  registerHandler(IPC_CHANNELS.searchManyMusicSources, (_event, queries: string[], limitPerQuery: number, popularityLevel: PopularityLevel, scope?: SourceRequestScope) => musicSources.searchMany(queries, limitPerQuery, popularityLevel, scope));
  registerHandler(IPC_CHANNELS.inspectSource, (_event, url: string, scope?: SourceRequestScope) => sources.inspect(url, scope));
  registerHandler(IPC_CHANNELS.prepareSource, async (event, source: YouTubeSource, scope?: SourceRequestScope) => {
    const prepared = await sources.prepare(source, scope);
    if (event.sender.isDestroyed()) {
      sources.release(prepared.leaseId);
      throw new Error("SOURCE_OPERATION_CANCELLED");
    }
    return prepared;
  });
  registerHandler(IPC_CHANNELS.readSource, (_event, leaseId: string) => sources.read(leaseId));
  registerHandler(IPC_CHANNELS.releaseSource, (_event, leaseId: string) => sources.release(leaseId));
  registerHandler(IPC_CHANNELS.cancelPlaybackSources, () => sources.cancelPlayback());

  const sweepTimer = setInterval(() => {
    void mediaCache.cleanup().catch((cause) => console.warn("[cache] periodic-cleanup-failed", cause));
  }, mediaCache.getPolicy().sweepIntervalMinutes * 60 * 1_000);
  sweepTimer.unref();
  const cleanupAfterResume = () => {
    void mediaCache.cleanup().catch((cause) => console.warn("[cache] resume-cleanup-failed", cause));
  };
  powerMonitor.on("resume", cleanupAfterResume);

  app.on("before-quit", () => {
    nativeVisualizer?.quit();
    clearInterval(sweepTimer);
    powerMonitor.removeListener("resume", cleanupAfterResume);
    sources.cancelAll();
    setGlobalMediaControlsActive(false);
  });

  createWindow(sources);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(sources);
    else if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.restore(); mainWindow.show(); }
  });
});

const MEDIA_ACCELERATORS: ReadonlyArray<[string, MediaControlCommand]> = [
  ["MediaPlayPause", "TOGGLE_PLAYBACK"],
  ["MediaNextTrack", "NEXT"],
  ["MediaPreviousTrack", "BACK"],
];

function setGlobalMediaControlsActive(active: boolean): void {
  if (!active) {
    for (const accelerator of registeredMediaAccelerators) globalShortcut.unregister(accelerator);
    registeredMediaAccelerators.clear();
    return;
  }
  for (const [accelerator, command] of MEDIA_ACCELERATORS) {
    if (registeredMediaAccelerators.has(accelerator)) continue;
    const registered = globalShortcut.register(accelerator, () => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC_CHANNELS.mediaControl, command);
    });
    if (registered) registeredMediaAccelerators.add(accelerator);
    else console.warn("[media-controls] global-shortcut-unavailable", { accelerator });
  }
}

function protectedSessionSourceIds(snapshot: SessionSnapshot): string[] {
  return playbackRetention(snapshot.queue, snapshot.currentIndex).protectedIds;
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (activeSources) createWindow(activeSources);
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
