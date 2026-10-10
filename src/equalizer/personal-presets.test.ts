import { describe, expect, it } from "vitest";
import { assertEqualizerSettings, defaultEqualizerSettings, EQUALIZER_PRESETS } from "../shared/equalizer";
import { removePersonalPreset, savePersonalPreset, selectEqualizerPreset } from "./personal-presets";

describe("equalizer settings and presets", () => {
  it("starts flat/bypassed and provides exactly the eight requested distinct curves", () => {
    const defaults = defaultEqualizerSettings(); assertEqualizerSettings(defaults);
    expect(defaults.enabled).toBe(false); expect(defaults.gainsDb).toEqual(Array(10).fill(0));
    expect(EQUALIZER_PRESETS.map(preset => preset.id)).toEqual(["rock", "salsa", "merengue", "bass", "treble", "reggae", "rap", "rnb"]);
    expect(new Set(EQUALIZER_PRESETS.map(preset => JSON.stringify(preset.gainsDb))).size).toBe(8);
    for (const preset of EQUALIZER_PRESETS) assertEqualizerSettings(selectEqualizerPreset(defaults, preset.id));
  });
  it("saves/selects/overwrites personal presets without aliasing their arrays", () => {
    const rock = selectEqualizerPreset(defaultEqualizerSettings(), "rock");
    const saved = savePersonalPreset(rock, " Mi sonido ", "personal-test");
    expect(saved.presetId).toBe("personal-test"); expect(saved.personalPresets[0].name).toBe("Mi sonido");
    saved.gainsDb[0] = 0; expect(saved.personalPresets[0].gainsDb[0]).toBe(4);
    const restored = selectEqualizerPreset(saved, "personal-test"); expect(restored.gainsDb[0]).toBe(4);
    const overwritten = savePersonalPreset({ ...saved, preampDb: -3 }, "mi SONIDO");
    expect(overwritten.personalPresets).toHaveLength(1); expect(overwritten.personalPresets[0].preampDb).toBe(-3);
    const removed = removePersonalPreset(overwritten, "personal-test"); expect(removed.presetId).toBeNull(); expect(removed.preampDb).toBe(-3);
  });
  it("rejects invalid persisted settings and unknown preset IDs", () => {
    for (const invalid of [{ gainsDb: [0] }, { preampDb: NaN }, { gainsDb: Array(10).fill(13) }, { enabled: "yes" }, { presetId: "nonexistent" }, { updatedAt: "oops" }]) {
      expect(() => assertEqualizerSettings({ ...defaultEqualizerSettings(), ...invalid })).toThrow("EQUALIZER_SETTINGS_INVALID");
    }
    expect(() => selectEqualizerPreset(defaultEqualizerSettings(), "jazz")).toThrow();
    expect(() => savePersonalPreset(defaultEqualizerSettings(), " ")).toThrow("EQUALIZER_NAME_INVALID");
  });
  it("bounds the personal library while allowing explicit overwrites at the limit", () => {
    let settings = defaultEqualizerSettings();
    for (let index = 0; index < 20; index++) settings = savePersonalPreset(settings, `Curve ${index}`, `personal-${index}`);
    expect(() => savePersonalPreset(settings, "one too many")).toThrow("EQUALIZER_PRESET_LIMIT");
    expect(savePersonalPreset(settings, "Curve 0").personalPresets).toHaveLength(20);
  });
});
