import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from "electron";
import type { EventEmitter } from "node:events";
import { IPC_CHANNELS as C } from "./channels";
import { isWindowCommand, type WindowState } from "../src/shared/window-controls";

function state(win: BrowserWindow): WindowState {
  return { maximized: win.isMaximized(), fullscreen: win.isFullScreen(), minimized: win.isMinimized(), focused: win.isFocused() };
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
    if (win.isFullScreen()) win.setFullScreen(false);
    else if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  });
}

export function attachWindowControls(win: BrowserWindow): void {
  const emitter: EventEmitter = win;
  const events = ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "minimize", "restore", "focus", "blur"] as const;
  const publish = () => {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(C.windowControlsChanged, state(win));
  };
  for (const event of events) emitter.on(event, publish);
  win.once("closed", () => { for (const event of events) emitter.removeListener(event, publish); });
}
