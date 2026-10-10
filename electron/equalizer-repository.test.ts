import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultEqualizerSettings } from "../src/shared/equalizer";
import { selectEqualizerPreset, savePersonalPreset } from "../src/equalizer/personal-presets";
import { EqualizerRepository } from "./equalizer-repository";
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
async function repository() { const directory = await mkdtemp(path.join(tmpdir(), "neoares-eq-test-")); directories.push(directory); return new EqualizerRepository(directory); }

describe("equalizer repository", () => {
  it("loads defaults and persists settings/personal presets across instances", async () => {
    const repo = await repository(); expect(await repo.load()).toEqual(defaultEqualizerSettings());
    const settings = savePersonalPreset(selectEqualizerPreset(defaultEqualizerSettings(), "salsa"), "Salsa casa", "personal-casa");
    await repo.save(settings); expect(await repo.load()).toEqual(settings);
    const fresh = new EqualizerRepository(path.dirname(path.dirname(repo.filePath)));
    expect(await fresh.load()).toEqual(settings);
  });
  it("serializes writes and recovers a corrupt primary from the valid backup", async () => {
    const repo = await repository(), first = selectEqualizerPreset(defaultEqualizerSettings(), "rock"), second = selectEqualizerPreset(first, "bass");
    await Promise.all([repo.save(first), repo.save(second)]); expect(await repo.load()).toEqual(second);
    await writeFile(repo.filePath, "corrupted"); expect(await repo.load()).toEqual(first);
    expect(JSON.parse(await readFile(repo.filePath, "utf8"))).toEqual(first);
  });
  it("does not silently replace corrupt settings when no valid backup exists", async () => {
    const repo = await repository(); await repo.save(defaultEqualizerSettings());
    await writeFile(repo.filePath, "corrupted"); await expect(repo.load()).rejects.toThrow("EQUALIZER_SETTINGS_UNREADABLE");
  });
});
