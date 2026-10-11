import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { EventEmitter } from "node:events";
import { IPC_CHANNELS as C } from "./channels";
import { isWindowCommand, type WindowState } from "../src/shared/window-controls";

const nativeStates = new WeakMap<BrowserWindow, WindowState>();
function state(win: BrowserWindow): WindowState {
  return nativeStates.get(win) ?? { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), minimized: win.isMinimized(), focused: win.isFocused() };
}

/** Commands always address the sender's own approved top-level window. */
export function registerWindowControls(resolve: (event: IpcMainInvokeEvent) => BrowserWindow | null): void {
  const authorized = (event: IpcMainInvokeEvent) => {
    const win = resolve(event);
    if (!win || win.isDestroyed() || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error("WINDOW_CONTROL_DENIED");
    return win;
  };
  ipcMain.handle(C.windowControlsState, event => state(authorized(event)));
  ipcMain.handle(C.windowControlsCommand, (event, command: unknown) => {
    const win = authorized(event);
    if (!isWindowCommand(command)) throw new Error("WINDOW_CONTROL_INVALID_COMMAND");
    if (command === "close") { win.close(); return; }
    if (command === "minimize") { win.minimize(); return; }
    // The same restore affordance also provides a way out of fullscreen.
    const current = state(win);
    if (current.fullscreen) win.setFullScreen(false);
    else if (current.maximized) win.unmaximize();
    else win.maximize();
  });
}

export function attachWindowControls(win: BrowserWindow): void {
  const emitter: EventEmitter = win;
  nativeStates.set(win, state(win));
  // On Windows fullscreen events can arrive before isFullScreen() reflects
  // them. Use the native event's meaning, not a stale getter, and keep unrelated
  // focus/restore events from overwriting that transition with an older value.
  const transitions: Record<string, Partial<WindowState>> = {
    maximize: { maximized: true }, unmaximize: { maximized: false },
    "enter-full-screen": { fullscreen: true }, "leave-full-screen": { fullscreen: false },
    minimize: { minimized: true }, restore: { minimized: false },
    focus: { focused: true }, blur: { focused: false },
  };
  const listeners = Object.entries(transitions).map(([event, patch]) => {
    const publish = () => {
      if (win.isDestroyed()) return;
      const next = { ...state(win), ...patch };
      nativeStates.set(win, next);
      if (!win.webContents.isDestroyed()) win.webContents.send(C.windowControlsChanged, next);
    };
    emitter.on(event, publish);
    return { event, publish };
  });
  win.once("closed", () => {
    for (const { event, publish } of listeners) emitter.removeListener(event, publish);
    nativeStates.delete(win);
  });
}
