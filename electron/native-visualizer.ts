import { BrowserWindow, ipcMain, MessageChannelMain, screen, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { IPC_CHANNELS as C } from "./channels";
import { isNativeVisualizerState, type NativeVisualizerState } from "../src/shared/native-visualizer";

export function clampWindowBounds(bounds: Electron.Rectangle, areas: Electron.Rectangle[]): Electron.Rectangle {
  const fallback = areas[0] ?? { x: 0, y: 0, width: 1280, height: 720 };
  const area = areas.find(a => bounds.x < a.x + a.width && bounds.x + bounds.width > a.x && bounds.y < a.y + a.height && bounds.y + bounds.height > a.y) ?? fallback;
  const width = Math.min(area.width, Math.max(360, bounds.width));
  const height = Math.min(area.height, Math.max(240, bounds.height));
  return { width, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) };
}

/** Main owns windows/ports only. PCM goes directly from audio thread to consumer. */
export class NativeVisualizerHost {
  window: BrowserWindow | null = null;
  #lastState: NativeVisualizerState | null = null;
  #generation = "";
  #quitting = false;
  #geometryTimer: ReturnType<typeof setTimeout> | undefined;
  #creation: Promise<void> | null = null;
  #saveChain: Promise<void> = Promise.resolve();
  constructor(readonly owner: BrowserWindow, readonly directory: string, readonly preload: string, readonly entry: string, readonly development = false) {
    for (const channel of [C.nativeVisualizerOpen, C.nativeVisualizerClose, C.nativeVisualizerReady, C.nativeVisualizerState, C.nativeVisualizerFullscreen]) ipcMain.removeHandler(channel);
    const requireOwner = (event: IpcMainInvokeEvent) => {
      if (event.sender !== owner.webContents || event.senderFrame !== owner.webContents.mainFrame) throw new Error("VISUALIZER_INVALID_OWNER");
    };
    const requireVisual = (event: IpcMainInvokeEvent) => {
      if (!this.window || event.sender !== this.window.webContents || event.senderFrame !== this.window.webContents.mainFrame) throw new Error("VISUALIZER_INVALID_CONSUMER");
    };
    ipcMain.handle(C.nativeVisualizerOpen, event => { requireOwner(event); return this.open(); });
    ipcMain.handle(C.nativeVisualizerClose, event => {
      if (event.sender === owner.webContents) requireOwner(event); else requireVisual(event);
      this.window?.close();
    });
    ipcMain.handle(C.nativeVisualizerReady, event => {
      requireVisual(event);
      const channel = new MessageChannelMain();
      this.#generation = randomUUID();
      this.window!.webContents.postMessage(C.nativeVisualizerPort, { generation: this.#generation, role: "consumer" }, [channel.port2]);
      owner.webContents.postMessage(C.nativeVisualizerPort, { generation: this.#generation, role: "owner" }, [channel.port1]);
      if (this.#lastState) this.window!.webContents.send(C.nativeVisualizerState, this.#lastState);
      this.reportVisibility();
    });
    ipcMain.handle(C.nativeVisualizerState, (event, state: unknown) => {
      requireOwner(event);
      if (!isNativeVisualizerState(state)) throw new Error("VISUALIZER_INVALID_STATE");
      this.#lastState = state;
      this.window?.webContents.send(C.nativeVisualizerState, state);
    });
    ipcMain.handle(C.nativeVisualizerFullscreen, event => {
      requireVisual(event);
      const win = this.window!;
      const next = !win.isFullScreen();
      win.setFullScreen(next);
      return next;
    });
    owner.on("close", event => { if (!this.#quitting && this.window) { event.preventDefault(); owner.hide(); } });
    owner.webContents.on("did-start-loading", () => this.window?.destroy());
    owner.webContents.on("render-process-gone", () => this.window?.destroy());
    owner.on("closed", () => this.quit());
    screen.on("display-removed", this.#clamp);
    screen.on("display-metrics-changed", this.#clamp);
  }

  async open(): Promise<void> {
    if (this.window) { this.window.restore(); this.window.show(); this.window.focus(); return; }
    if (this.#creation) return this.#creation;
    this.#creation = this.#create().finally(() => { this.#creation = null; });
    return this.#creation;
  }
  async #create(): Promise<void> {
    await this.#saveChain;
    let saved = { x: 40, y: 80, width: 960, height: 600 };
    try {
      const value = JSON.parse(await readFile(path.join(this.directory, "visualizer-native-window.json"), "utf8"));
      if ([value.x, value.y, value.width, value.height].every(Number.isFinite)) saved = value;
    } catch { /* First native launch ignores legacy DOM coordinates. */ }
    if (this.#quitting || this.owner.isDestroyed()) return;
    const win = new BrowserWindow({
      ...clampWindowBounds(saved, screen.getAllDisplays().map(d => d.workArea)),
      minWidth: 360, minHeight: 240, title: "NeoAres · Visualizer", frame: false, show: false, backgroundColor: "#03030a",
      webPreferences: { preload: this.preload, additionalArguments: ["--neoares-visualizer"], sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: true },
    });
    this.window = win;
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (event, url) => { if (url !== win.webContents.getURL()) event.preventDefault(); });
    const visibility = () => {
      this.reportVisibility();
      win.webContents.send(C.windowVisibility, win.isVisible() && !win.isMinimized());
    };
    win.on("show", visibility); win.on("hide", visibility); win.on("minimize", visibility); win.on("restore", visibility);
    win.webContents.on("render-process-gone", () => win.destroy());
    win.on("enter-full-screen", () => win.webContents.send(C.nativeVisualizerFullscreenChanged, true));
    win.on("leave-full-screen", () => win.webContents.send(C.nativeVisualizerFullscreenChanged, false));
    const save = () => {
      clearTimeout(this.#geometryTimer);
      if (win.isFullScreen() || win.isMinimized() || win.isDestroyed()) return;
      const bounds = win.getNormalBounds();
      this.#geometryTimer = setTimeout(() => this.#saveBounds(bounds), 250);
    };
    win.on("resize", save); win.on("move", save);
    win.on("close", () => {
      clearTimeout(this.#geometryTimer);
      this.#saveBounds(win.getNormalBounds());
    });
    win.on("closed", () => {
      this.window = null;
      if (!this.owner.isDestroyed() && !this.owner.webContents.isDestroyed()) {
        this.owner.webContents.send(C.nativeVisualizerClosed);
        if (!this.#quitting) { this.owner.restore(); this.owner.show(); }
      }
    });
    win.once("ready-to-show", () => win.show());
    try {
      if (this.development) await win.loadURL(`${this.entry.replace(/\/$/, "")}/?view=visualizer`);
      else await win.loadFile(this.entry, { query: { view: "visualizer" } });
    } catch (error) { win.destroy(); throw error; }
  }
  reportVisibility(): void {
    if (!this.owner.isDestroyed()) this.owner.webContents.send(C.nativeVisualizerCapture, Boolean(this.window?.isVisible() && !this.window?.isMinimized()));
  }
  #clamp = (): void => {
    if (this.window && !this.window.isFullScreen()) this.window.setBounds(clampWindowBounds(this.window.getBounds(), screen.getAllDisplays().map(d => d.workArea)));
  };
  #saveBounds(bounds: Electron.Rectangle): void {
    this.#saveChain = this.#saveChain.then(async () => {
      const file = path.join(this.directory, "visualizer-native-window.json");
      await writeFile(`${file}.tmp`, JSON.stringify(bounds), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    }).catch(error => console.warn("[visualizer] geometry-save-failed", error));
  }
  quit(): void {
    this.#quitting = true;
    clearTimeout(this.#geometryTimer);
    screen.removeListener("display-removed", this.#clamp);
    screen.removeListener("display-metrics-changed", this.#clamp);
    this.window?.destroy();
  }
}
