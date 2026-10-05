import { copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AppState, LanguagePreference, SessionSnapshot, YouTubeSource } from "../src/shared/contracts";

const DEFAULT_APP_STATE: AppState = {
  schemaVersion: 2,
  lastSelectedDjId: null,
  languagePreference: "system",
  updatedAt: new Date(0).toISOString(),
};

export class AppStateRepository {
  #writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  async load(): Promise<AppState> {
    const value = await readOptionalJson(this.filePath());
    if (value === null) return { ...DEFAULT_APP_STATE };
    if (isLegacyAppState(value)) {
      const migrated: AppState = {
        schemaVersion: 2,
        lastSelectedDjId: value.lastSelectedDjId,
        languagePreference: "system",
        updatedAt: new Date().toISOString(),
      };
      await this.save(migrated);
      return migrated;
    }
    assertAppState(value);
    return value;
  }

  async save(state: AppState): Promise<void> {
    assertAppState(state);
    this.#writeChain = this.#writeChain.catch(() => undefined).then(() => writeAtomicJson(this.filePath(), state));
    await this.#writeChain;
  }

  private filePath(): string {
    return path.join(this.dataDirectory, "app-state.json");
  }
}

export class SessionRepository {
  #writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  async loadActive(): Promise<SessionSnapshot | null> {
    const value = await readOptionalJson(this.filePath());
    if (value === null) return null;
    assertSessionSnapshot(value);
    return value;
  }

  async saveActive(snapshot: SessionSnapshot): Promise<void> {
    assertSessionSnapshot(snapshot);
    this.#writeChain = this.#writeChain.catch(() => undefined).then(() => writeAtomicJson(this.filePath(), snapshot));
    await this.#writeChain;
  }

  async clearActive(): Promise<void> {
    this.#writeChain = this.#writeChain.catch(() => undefined).then(async () => {
      await Promise.all([this.filePath(), `${this.filePath()}.bak`].map(async (filePath) => {
        try {
          await unlink(filePath);
        } catch (error) {
          if (!isMissingFile(error)) throw error;
        }
      }));
    });
    await this.#writeChain;
  }

  private filePath(): string {
    return path.join(this.dataDirectory, "sessions", "active.json");
  }
}

async function readOptionalJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

async function writeAtomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const backup = `${filePath}.bak`;
  try {
    await copyFile(filePath, backup);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

function assertAppState(value: unknown): asserts value is AppState {
  if (!isRecord(value)
    || value.schemaVersion !== 2
    || !(value.lastSelectedDjId === null || typeof value.lastSelectedDjId === "string")
    || !isLanguagePreference(value.languagePreference)
    || !isTimestamp(value.updatedAt)) {
    throw new Error("APP_STATE_INVALID");
  }
}

function isLegacyAppState(value: unknown): value is { schemaVersion: 1; lastSelectedDjId: string | null; updatedAt: string } {
  return isRecord(value)
    && value.schemaVersion === 1
    && (value.lastSelectedDjId === null || typeof value.lastSelectedDjId === "string")
    && isTimestamp(value.updatedAt);
}

function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || value === "es" || value === "en";
}

function assertSessionSnapshot(value: unknown): asserts value is SessionSnapshot {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.sessionId !== "string"
    || typeof value.djId !== "string"
    || !Number.isInteger(value.djRevision)
    || !["PLAYING", "PAUSED", "RECOVERING"].includes(String(value.phase))
    || !Array.isArray(value.queue)
    || !value.queue.every(isYouTubeSource)
    || !Number.isInteger(value.currentIndex)
    || Number(value.currentIndex) < 0
    || Number(value.currentIndex) >= value.queue.length
    || typeof value.positionSeconds !== "number"
    || !Number.isFinite(value.positionSeconds)
    || value.positionSeconds < 0
    || !Number.isInteger(value.discoveryRound)
    || Number(value.discoveryRound) < 0
    || !isTimestamp(value.savedAt)
    || value.recoverable !== true) {
    throw new Error("SESSION_SNAPSHOT_INVALID");
  }
}

function isYouTubeSource(value: unknown): value is YouTubeSource {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.canonicalUrl === "string"
    && typeof value.title === "string"
    && typeof value.creator === "string"
    && typeof value.durationSeconds === "number"
    && Number.isFinite(value.durationSeconds)
    && (value.thumbnailUrl === null || typeof value.thumbnailUrl === "string")
    && (value.catalog === undefined || value.catalog === "YOUTUBE" || value.catalog === "YOUTUBE_MUSIC")
    && (value.requestedByUser === undefined || typeof value.requestedByUser === "boolean")
    && (value.musicMetadata === undefined || isMusicMetadata(value.musicMetadata));
}

function isMusicMetadata(value: unknown): boolean {
  return isRecord(value)
    && value.resultType === "SONG"
    && Array.isArray(value.artists)
    && value.artists.length > 0
    && value.artists.every((artist) => typeof artist === "string" && Boolean(artist.trim()))
    && (value.album === null || typeof value.album === "string")
    && (value.popularityScore === undefined || (typeof value.popularityScore === "number" && value.popularityScore >= 0 && value.popularityScore <= 1))
    && (value.discoveryPath === undefined || value.discoveryPath === "SEARCH" || value.discoveryPath === "ALBUM");
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
