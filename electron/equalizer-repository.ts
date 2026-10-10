import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EqualizerSettings } from "../src/shared/contracts";
import { assertEqualizerSettings, defaultEqualizerSettings } from "../src/shared/equalizer";

export class EqualizerRepository {
  readonly filePath: string;
  #writes: Promise<void> = Promise.resolve();
  constructor(dataDirectory: string) { this.filePath = path.join(dataDirectory, "equalizer", "settings.json"); }

  async load(): Promise<EqualizerSettings> {
    await this.#writes.catch(() => undefined);
    let missing = false;
    try { return await readSettings(this.filePath); }
    catch (error) { missing = isMissing(error); }
    try {
      const backup = await readSettings(`${this.filePath}.bak`);
      // Preserve a valid backup instead of replacing it with the corrupt primary.
      await this.#write(backup, false);
      return backup;
    } catch (error) {
      if (missing && isMissing(error)) return defaultEqualizerSettings();
      throw new Error("EQUALIZER_SETTINGS_UNREADABLE");
    }
  }

  save(settings: EqualizerSettings): Promise<void> {
    assertEqualizerSettings(settings);
    const snapshot = structuredClone(settings);
    this.#writes = this.#writes.catch(() => undefined).then(() => this.#write(snapshot, true));
    return this.#writes;
  }

  async #write(settings: EqualizerSettings, backup: boolean): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    if (backup) {
      try { await copyFile(this.filePath, `${this.filePath}.bak`); }
      catch (error) { if (!isMissing(error)) throw error; }
    }
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
async function readSettings(filePath: string): Promise<EqualizerSettings> {
  const value: unknown = JSON.parse(await readFile(filePath, "utf8"));
  assertEqualizerSettings(value);
  return value;
}
function isMissing(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
