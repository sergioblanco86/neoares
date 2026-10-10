import { describe, expect, it } from "vitest";
import { defaultEqualizerSettings } from "../shared/equalizer";
import { EQUALIZER_RESTART_REQUIRED, loadEqualizerSettings } from "./load-settings";

describe("equalizer desktop startup", () => {
  it("loads settings from the desktop bridge", async () => {
    const settings = defaultEqualizerSettings();
    await expect(loadEqualizerSettings({ equalizer: { loadSettings: async () => settings, saveSettings: async () => {} } })).resolves.toEqual(settings);
  });

  it("requires a restart when the old preload has no EQ bridge", async () => {
    await expect(loadEqualizerSettings(undefined)).rejects.toThrow(EQUALIZER_RESTART_REQUIRED);
    await expect(loadEqualizerSettings({} as Parameters<typeof loadEqualizerSettings>[0])).rejects.toThrow(EQUALIZER_RESTART_REQUIRED);
  });

  it("requires a restart when the preload is newer than the main process", async () => {
    const error = new Error("Error invoking remote method 'equalizer-settings:load': Error: No handler registered for 'equalizer-settings:load'");
    await expect(loadEqualizerSettings({ equalizer: { loadSettings: async () => { throw error; }, saveSettings: async () => {} } })).rejects.toThrow(EQUALIZER_RESTART_REQUIRED);
  });

  it("preserves disk errors instead of replacing saved curves with defaults", async () => {
    const error = new Error("EQUALIZER_SETTINGS_UNREADABLE");
    await expect(loadEqualizerSettings({ equalizer: { loadSettings: async () => { throw error; }, saveSettings: async () => {} } })).rejects.toBe(error);
  });

  it("still rejects invalid settings from IPC", async () => {
    await expect(loadEqualizerSettings({ equalizer: { loadSettings: async () => ({ ...defaultEqualizerSettings(), gainsDb: [] }), saveSettings: async () => {} } })).rejects.toThrow("EQUALIZER_SETTINGS_INVALID");
  });
});
