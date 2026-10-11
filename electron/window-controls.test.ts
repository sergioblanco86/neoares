import { EventEmitter } from "node:events";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS as C } from "./channels";
import { isWindowCommand, isWindowState } from "../src/shared/window-controls";

const handlers = vi.hoisted(() => new Map<string, (...args: any[]) => unknown>());
vi.mock("electron", () => ({ ipcMain: { handle: (name: string, listener: (...args: any[]) => unknown) => handlers.set(name, listener) } }));
import { attachWindowControls, registerWindowControls } from "./window-controls";

function fixture() {
  const win = Object.assign(new EventEmitter(), {
    webContents: { mainFrame: {}, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: (): boolean => false, isMaximized: (): boolean => false, isFullScreen: (): boolean => false,
    isMinimized: (): boolean => false, isFocused: (): boolean => true,
    close: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(), setFullScreen: vi.fn(),
  });
  const event = { sender: win.webContents, senderFrame: win.webContents.mainFrame } as unknown as IpcMainInvokeEvent;
  registerWindowControls(() => win as unknown as BrowserWindow);
  const command = (value: unknown, sender = event) => handlers.get(C.windowControlsCommand)!(sender, value);
  return { win, event, command };
}

beforeEach(() => handlers.clear());
describe("sender-scoped custom window controls", () => {
  it("only accepts the three explicit commands and a fully boolean state", () => {
    expect(["minimize", "toggleMaximize", "close"].every(isWindowCommand)).toBe(true);
    expect(["destroy", "quit", "setBounds", {}, null].some(isWindowCommand)).toBe(false);
    expect(isWindowState({ maximized: false, fullscreen: false, minimized: false, focused: true })).toBe(true);
    expect(isWindowState({ maximized: "false", fullscreen: false, minimized: false, focused: true })).toBe(false);
    expect(isWindowState(null)).toBe(false);
  });
  it("returns native state and minimizes only the authorized window", () => {
    const { win, event, command } = fixture();
    expect(handlers.get(C.windowControlsState)!(event)).toEqual({ maximized: false, fullscreen: false, minimized: false, focused: true });
    command("minimize"); expect(win.minimize).toHaveBeenCalledOnce();
  });
  it("maximizes then restores according to native state, not optimistic UI state", () => {
    const { win, command } = fixture();
    command("toggleMaximize"); expect(win.maximize).toHaveBeenCalledOnce();
    win.isMaximized = () => true;
    command("toggleMaximize"); expect(win.unmaximize).toHaveBeenCalledOnce();
  });
  it("restores from fullscreen without maximizing", () => {
    const { win, command } = fixture(); win.isFullScreen = () => true;
    command("toggleMaximize"); expect(win.setFullScreen).toHaveBeenCalledWith(false);
    expect(win.maximize).not.toHaveBeenCalled();
  });
  it("uses close, preserving existing hide/audio lifecycle instead of destroy or quit", () => {
    const { win, command } = fixture(); command("close"); expect(win.close).toHaveBeenCalledOnce();
  });
  it("rejects subframes, other senders, destroyed windows and arbitrary commands", () => {
    const { win, event, command } = fixture();
    expect(() => command("minimize", { ...event, senderFrame: {} } as IpcMainInvokeEvent)).toThrow("WINDOW_CONTROL_DENIED");
    expect(() => command("minimize", { ...event, sender: {} } as IpcMainInvokeEvent)).toThrow("WINDOW_CONTROL_DENIED");
    expect(() => command({ command: "close", windowId: 3 })).toThrow("WINDOW_CONTROL_INVALID_COMMAND");
    win.isDestroyed = () => true;
    expect(() => command("close")).toThrow("WINDOW_CONTROL_DENIED");
    expect(win.close).not.toHaveBeenCalled(); expect(win.minimize).not.toHaveBeenCalled();
  });
  it("rejects callers outside the approved owner/visualizer pair", () => {
    const { event } = fixture(); registerWindowControls(() => null);
    expect(() => handlers.get(C.windowControlsState)!(event)).toThrow("WINDOW_CONTROL_DENIED");
  });
  it("publishes external state changes and cleans up all native listeners on close", () => {
    const { win } = fixture(); attachWindowControls(win as unknown as BrowserWindow);
    for (const event of ["maximize", "unmaximize", "enter-full-screen", "leave-full-screen", "minimize", "restore", "focus", "blur"]) win.emit(event);
    expect(win.webContents.send).toHaveBeenCalledTimes(8);
    expect(win.webContents.send).toHaveBeenLastCalledWith(C.windowControlsChanged, { maximized: false, fullscreen: false, minimized: false, focused: true });
    win.emit("closed"); expect(win.eventNames()).toEqual([]);
  });
});
