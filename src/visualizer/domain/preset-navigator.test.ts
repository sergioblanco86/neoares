import { describe, expect, it } from "vitest";
import { PresetNavigator } from "./preset-navigator";
import { bundledPresetCatalog, PRESET_KEYS } from "../preset-catalog";
const entries = bundledPresetCatalog(Object.fromEntries(PRESET_KEYS.map(key => [key, {}])));

describe("PresetNavigator", () => {
  it("returns actual history rather than the preceding catalog entry", () => {
    const navigator = new PresetNavigator(); navigator.setEntries(entries);
    navigator.select(entries[0].id); navigator.select(entries[5].id); navigator.select(entries[2].id);
    expect(navigator.previous()).toBe(entries[5].id);
    expect(navigator.previous()).toBe(entries[0].id);
  });
  it("excludes recent presets while allowing small catalogs to keep moving", () => {
    const navigator = new PresetNavigator(); navigator.setEntries(entries.slice(0, 3));
    navigator.select(entries[0].id); navigator.select(entries[1].id);
    expect(navigator.random(() => 0)).toBe(entries[2].id);
    expect(navigator.random(() => 0)).not.toBe(entries[2].id);
  });
  it("caps history and excludes failed presets until retried", () => {
    const navigator = new PresetNavigator(); navigator.setEntries(entries);
    for (let i = 0; i < 45; i++) navigator.next();
    expect(navigator.history).toHaveLength(20);
    for (const entry of entries) navigator.markFailed(entry.id);
    expect(() => navigator.next()).toThrow("VISUALIZER_NO_VALID_PRESET");
    navigator.retry(entries[0].id); expect(navigator.next()).toBe(entries[0].id);
  });
});
