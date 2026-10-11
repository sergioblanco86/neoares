export type WindowCommand = "minimize" | "toggleMaximize" | "close";
export type WindowState = { maximized: boolean; fullscreen: boolean; minimized: boolean; focused: boolean };
export type WindowControlsApi = {
  getState(): Promise<WindowState>;
  command(command: WindowCommand): Promise<void>;
  onState(listener: (state: WindowState) => void): () => void;
};

export function isWindowCommand(value: unknown): value is WindowCommand {
  return value === "minimize" || value === "toggleMaximize" || value === "close";
}

export function isWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== "object") return false;
  const state = value as WindowState;
  return [state.maximized, state.fullscreen, state.minimized, state.focused].every(value => typeof value === "boolean");
}
