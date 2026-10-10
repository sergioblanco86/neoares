import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ dialog: {}, BrowserWindow: class {} }));

import { VisualizerPresentationRepository, VisualizerPresetLibrary, VisualizerSettingsRepository } from "./visualizer-repository";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))); });

async function dataDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "neoares-visualizer-"));
  directories.push(directory);
  return directory;
}

describe("VisualizerSettingsRepository", () => {
  it("returns complete defaults then atomically persists validated settings", async () => {
    const repository = new VisualizerSettingsRepository(await dataDirectory());
    const settings = await repository.load();
    expect(settings).toMatchObject({ schemaVersion: 1, autoChange: true, quality: "auto", presetId: null });
    const saved = { ...settings, presetId: "bundled-artifact", quality: "high" as const, updatedAt: new Date().toISOString() };
    await repository.save(saved);
    await expect(repository.load()).resolves.toEqual(saved);
  });

  it("rejects invalid settings instead of replacing them", async () => {
    const repository = new VisualizerSettingsRepository(await dataDirectory());
    await expect(repository.save({ ...await repository.load(), changeIntervalSeconds: 1 })).rejects.toThrow("VISUALIZER_SETTINGS_INVALID");
  });

  it("serializes concurrent writes without losing the last complete document", async () => {
    const repository = new VisualizerSettingsRepository(await dataDirectory());
    const original = await repository.load();
    const first = { ...original, quality: "low" as const };
    const second = { ...original, quality: "high" as const, locked: true };
    await Promise.all([repository.save(first), repository.save(second)]);
    await expect(repository.load()).resolves.toEqual(second);
  });
});

describe("VisualizerPresentationRepository", () => {
  it("persists a bounded floating-window geometry independently", async () => {
    const repository = new VisualizerPresentationRepository(await dataDirectory());
    const presentation = { schemaVersion: 1 as const, x: -20, y: 30, width: 700, height: 460, updatedAt: new Date().toISOString() };
    await repository.save(presentation);
    await expect(repository.load()).resolves.toEqual(presentation);
  });
});

describe("VisualizerPresetLibrary", () => {
  it("converts a local MilkDrop preset, persists it, de-duplicates it and removes only its managed files", async () => {
    const directory = await dataDirectory();
    const source = path.join(directory, "trusted.milk");
    await writeFile(source, "[preset00]\nfRating=3.0\nfGammaAdj=1.0\nfDecay=0.98\nper_frame_1=wave_r=sin(time);\n");
    const library = new VisualizerPresetLibrary(directory);

    const first = await library.importFiles([source]);
    expect(first.importedIds).toHaveLength(1);
    const [preset] = await library.list();
    expect(preset).toMatchObject({ origin: "imported", compatibility: "ready", favorite: false });
    await expect(library.loadDefinition(preset.id)).resolves.toMatchObject({
      waves: expect.any(Array), shapes: expect.any(Array),
      frame_eqs_str: expect.stringContaining("Math.sin(a['time'])"),
      frame_eqs_eel: "wave_r=sin(time);",
      baseVals: { rating: 3 },
    });
    await library.setFavorite(preset.id, true);
    await expect(library.list()).resolves.toMatchObject([{ id: preset.id, favorite: true }]);
    await expect(library.importFiles([source])).resolves.toMatchObject({ importedIds: [], skipped: [{ sourceName: "trusted.milk", reason: "VISUALIZER_PRESET_DUPLICATE" }] });
    await library.remove(preset.id);
    await expect(library.list()).resolves.toEqual([]);
  });

  it("keeps malformed sources out of the playable library", async () => {
    const directory = await dataDirectory();
    const source = path.join(directory, "invalid.milk");
    await writeFile(source, "this is not a MilkDrop preset");
    const library = new VisualizerPresetLibrary(directory);
    await expect(library.importFiles([source])).resolves.toMatchObject({ importedIds: [], incompatible: [{ reason: "VISUALIZER_PRESET_INVALID_FORMAT" }] });
    const [preset] = await library.list();
    await expect(library.loadDefinition(preset.id)).rejects.toThrow("VISUALIZER_PRESET_NOT_AVAILABLE");
    await expect(library.retry(preset.id)).resolves.toMatchObject({ compatibility: "incompatible", compatibilityError: "VISUALIZER_PRESET_INVALID_FORMAT" });
    await library.remove(preset.id);
    await expect(library.list()).resolves.toEqual([]);
  });
});
