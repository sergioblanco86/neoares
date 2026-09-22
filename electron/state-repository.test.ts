import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AppState, SessionSnapshot } from "../src/shared/contracts";
import { AppStateRepository, SessionRepository } from "./state-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function temporaryDataDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "neoares-state-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("AppStateRepository", () => {
  it("returns an empty first-launch state and persists the last DJ atomically", async () => {
    const directory = await temporaryDataDirectory();
    const repository = new AppStateRepository(directory);
    await expect(repository.load()).resolves.toMatchObject({ schemaVersion: 2, lastSelectedDjId: null, languagePreference: "system" });

    const state: AppState = { schemaVersion: 2, lastSelectedDjId: "dj-1", languagePreference: "en", updatedAt: new Date().toISOString() };
    await repository.save(state);

    await expect(repository.load()).resolves.toEqual(state);
    await expect(readFile(path.join(directory, "app-state.json"), "utf8")).resolves.toContain('"lastSelectedDjId": "dj-1"');
  });

  it("serializes concurrent saves without sharing a temporary file", async () => {
    const directory = await temporaryDataDirectory();
    const repository = new AppStateRepository(directory);
    const first: AppState = { schemaVersion: 2, lastSelectedDjId: "dj-1", languagePreference: "es", updatedAt: new Date(1).toISOString() };
    const second: AppState = { schemaVersion: 2, lastSelectedDjId: "dj-2", languagePreference: "en", updatedAt: new Date(2).toISOString() };

    await Promise.all([repository.save(first), repository.save(second)]);

    await expect(repository.load()).resolves.toEqual(second);
  });

  it("migrates a version 1 state without losing the last selected DJ", async () => {
    const directory = await temporaryDataDirectory();
    const legacy = { schemaVersion: 1, lastSelectedDjId: "dj-legacy", updatedAt: new Date(1).toISOString() };
    await writeFile(path.join(directory, "app-state.json"), JSON.stringify(legacy));

    const migrated = await new AppStateRepository(directory).load();

    expect(migrated).toMatchObject({ schemaVersion: 2, lastSelectedDjId: "dj-legacy", languagePreference: "system" });
    await expect(readFile(path.join(directory, "app-state.json"), "utf8")).resolves.toContain('"languagePreference": "system"');
  });
});

describe("SessionRepository", () => {
  it("persists and clears the active recoverable snapshot", async () => {
    const directory = await temporaryDataDirectory();
    const repository = new SessionRepository(directory);
    const snapshot: SessionSnapshot = {
      schemaVersion: 1,
      sessionId: "session-1",
      djId: "dj-1",
      djRevision: 2,
      phase: "PLAYING",
      queue: [{
        id: "track-1",
        canonicalUrl: "https://www.youtube.com/watch?v=track-1",
        title: "Track 1",
        creator: "Artist",
        durationSeconds: 180,
        thumbnailUrl: null,
      }],
      currentIndex: 0,
      positionSeconds: 42,
      discoveryRound: 3,
      savedAt: new Date().toISOString(),
      recoverable: true,
    };

    await repository.saveActive(snapshot);
    await expect(repository.loadActive()).resolves.toEqual(snapshot);
    await repository.clearActive();
    await expect(repository.loadActive()).resolves.toBeNull();
    await expect(access(path.join(directory, "sessions", "active.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects snapshots whose current index falls outside the queue", async () => {
    const directory = await temporaryDataDirectory();
    const repository = new SessionRepository(directory);
    const invalid = {
      schemaVersion: 1,
      sessionId: "session-1",
      djId: "dj-1",
      djRevision: 1,
      phase: "PLAYING",
      queue: [],
      currentIndex: 0,
      positionSeconds: 0,
      discoveryRound: 0,
      savedAt: new Date().toISOString(),
      recoverable: true,
    } as SessionSnapshot;

    await expect(repository.saveActive(invalid)).rejects.toThrow("SESSION_SNAPSHOT_INVALID");
  });

  it("orders clear after an in-flight save so a finished session cannot reappear", async () => {
    const directory = await temporaryDataDirectory();
    const repository = new SessionRepository(directory);
    const snapshot: SessionSnapshot = {
      schemaVersion: 1,
      sessionId: "session-1",
      djId: "dj-1",
      djRevision: 1,
      phase: "PAUSED",
      queue: [{
        id: "track-1",
        canonicalUrl: "https://www.youtube.com/watch?v=track-1",
        title: "Track 1",
        creator: "Artist",
        durationSeconds: 180,
        thumbnailUrl: null,
      }],
      currentIndex: 0,
      positionSeconds: 20,
      discoveryRound: 1,
      savedAt: new Date().toISOString(),
      recoverable: true,
    };

    const save = repository.saveActive(snapshot);
    const clear = repository.clearActive();
    await Promise.all([save, clear]);

    await expect(repository.loadActive()).resolves.toBeNull();
  });
});
