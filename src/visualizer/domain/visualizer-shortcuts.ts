export type VisualizerShortcutCommand = "CLOSE" | "TOGGLE_FULLSCREEN" | "RANDOM" | "TOGGLE_LOCK" | "PREVIOUS" | "NEXT";

export function resolveVisualizerShortcut(input: { key: string; repeat: boolean; editable: boolean; modalOpen: boolean; fullscreen: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): VisualizerShortcutCommand | null {
  if (input.editable || input.modalOpen || input.ctrlKey || input.metaKey || input.altKey) return null;
  if (input.key === "ArrowLeft") return "PREVIOUS";
  if (input.key === "ArrowRight") return "NEXT";
  if (input.repeat) return null;
  if (input.key === "Escape") return input.fullscreen ? "TOGGLE_FULLSCREEN" : "CLOSE";
  if (input.key.toLowerCase() === "f") return "TOGGLE_FULLSCREEN";
  if (input.key.toLowerCase() === "r") return "RANDOM";
  if (input.key.toLowerCase() === "l") return "TOGGLE_LOCK";
  return null;
}
