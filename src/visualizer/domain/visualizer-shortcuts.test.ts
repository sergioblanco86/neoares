import { describe, expect, it } from "vitest";
import { resolveVisualizerShortcut } from "./visualizer-shortcuts";

const base = { repeat: false, editable: false, modalOpen: false, fullscreen: false };

describe("resolveVisualizerShortcut", () => {
  it("maps the documented visualizer controls", () => {
    expect(resolveVisualizerShortcut({ ...base, key: "f" })).toBe("TOGGLE_FULLSCREEN");
    expect(resolveVisualizerShortcut({ ...base, key: "r" })).toBe("RANDOM");
    expect(resolveVisualizerShortcut({ ...base, key: "l" })).toBe("TOGGLE_LOCK");
    expect(resolveVisualizerShortcut({ ...base, key: "ArrowLeft" })).toBe("PREVIOUS");
    expect(resolveVisualizerShortcut({ ...base, key: "ArrowRight" })).toBe("NEXT");
    expect(resolveVisualizerShortcut({ ...base, key: "Escape" })).toBe("CLOSE");
  });

  it("never steals a shortcut from an editable control or a modal", () => {
    expect(resolveVisualizerShortcut({ ...base, key: "f", editable: true })).toBeNull();
    expect(resolveVisualizerShortcut({ ...base, key: "f", modalOpen: true })).toBeNull();
    expect(resolveVisualizerShortcut({ ...base, key: "r", repeat: true })).toBeNull();
    expect(resolveVisualizerShortcut({ ...base, key: "ArrowLeft", metaKey: true })).toBeNull();
    expect(resolveVisualizerShortcut({ ...base, key: "f", ctrlKey: true })).toBeNull();
  });
});
