import { describe, expect, it } from "vitest";
import { resolveBackAction, resolveTransportKeyboardCommand } from "./transport-controls";

const keyboardInput = {
  code: "Space",
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
  editable: false,
  modalOpen: false,
};

describe("transport controls", () => {
  it("maps focused-app shortcuts without claiming unmodified arrow keys", () => {
    expect(resolveTransportKeyboardCommand(keyboardInput)).toBe("TOGGLE_PLAYBACK");
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, code: "ArrowRight", ctrlKey: true })).toBe("NEXT");
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, code: "ArrowLeft", metaKey: true })).toBe("BACK");
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, code: "ArrowRight" })).toBeNull();
  });

  it("ignores shortcuts while typing, inside a modal, or on key repeat", () => {
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, editable: true })).toBeNull();
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, modalOpen: true })).toBeNull();
    expect(resolveTransportKeyboardCommand({ ...keyboardInput, repeat: true })).toBeNull();
  });

  it("restarts first and returns to the previous track on a second press", () => {
    expect(resolveBackAction(null, 1_000, true)).toBe("RESTART");
    expect(resolveBackAction(1_000, 1_750, true)).toBe("PREVIOUS");
    expect(resolveBackAction(1_000, 2_001, true)).toBe("RESTART");
    expect(resolveBackAction(1_000, 1_500, false)).toBe("RESTART");
  });
});
