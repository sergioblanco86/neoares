export const PREVIOUS_DOUBLE_PRESS_MS = 1_000;

export type TransportCommand = "TOGGLE_PLAYBACK" | "NEXT" | "BACK";
export type BackAction = "RESTART" | "PREVIOUS";

type KeyboardInput = {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  editable: boolean;
  modalOpen: boolean;
};

export function resolveTransportKeyboardCommand(input: KeyboardInput): TransportCommand | null {
  if (input.repeat || input.editable || input.modalOpen || input.altKey || input.shiftKey) return null;
  const primaryModifier = input.ctrlKey || input.metaKey;
  if (input.code === "Space" && !primaryModifier) return "TOGGLE_PLAYBACK";
  if (input.code === "ArrowRight" && primaryModifier) return "NEXT";
  if (input.code === "ArrowLeft" && primaryModifier) return "BACK";
  return null;
}

export function resolveBackAction(
  lastPressAt: number | null,
  currentPressAt: number,
  hasPrevious: boolean,
  doublePressMs = PREVIOUS_DOUBLE_PRESS_MS,
): BackAction {
  if (!hasPrevious || lastPressAt === null) return "RESTART";
  const elapsed = currentPressAt - lastPressAt;
  return elapsed >= 0 && elapsed <= doublePressMs ? "PREVIOUS" : "RESTART";
}
