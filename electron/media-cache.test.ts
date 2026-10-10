import { access, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CachePolicy, SessionSnapshot } from "../src/shared/contracts";
import { MediaCache } from "./media-cache";

const temporaryDirectories: string[] = [];
const TEST_POLICY: CachePolicy = {
  maxBytes: 2_000,
  cleanupTargetBytes: 1_000,
  maxUnusedAgeDays: 30,
  partialMaxAgeMinutes: 60,
  sweepIntervalMinutes: 30,
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

describe("MediaCache", () => {
  it("migrates legacy audio, removes abandoned partials and builds its index", async () => {
    const userData = await temporaryDirectory("neoares-cache-");
    const legacy = path.join(userData, "Cache", "sources");
    await mkdir(legacy, { recursive: true });
    await writeFile(path.join(legacy, "track-a.m4a"), Buffer.alloc(1_200, 1));
    const partial = path.join(legacy, "track-b.webm.part");
    await writeFile(partial, Buffer.alloc(300, 2));
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1_000);
    await utimes(partial, oldDate, oldDate);

    const cache = new MediaCache(userData, [legacy], { ...TEST_POLICY, maxBytes: 5_000, cleanupTargetBytes: 4_000 });
    await cache.initialize();

    await expect(stat(path.join(cache.audioDirectory, "track-a.m4a"))).resolves.toMatchObject({ size: 1_200 });
    await expect(access(partial)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(cache.getStats()).resolves.toMatchObject({ audioFileCount: 1, totalBytes: 1_200, partialFileCount: 0 });
    await expect(readFile(cache.indexPath, "utf8")).resolves.toContain('"track-a"');
  });

  it("cleans to the target while preserving protected session audio", async () => {
    const userData = await temporaryDirectory("neoares-cache-");
    const cache = new MediaCache(userData, [], TEST_POLICY);
    await mkdir(cache.audioDirectory, { recursive: true });
    await writeFile(path.join(cache.audioDirectory, "old.m4a"), Buffer.alloc(1_200, 1));
    await writeFile(path.join(cache.audioDirectory, "current.m4a"), Buffer.alloc(1_200, 2));
    cache.protect(["current"]);

    const result = await cache.initialize();

    expect(result).toMatchObject({ bytesBefore: 2_400, bytesAfter: 1_200, removedFiles: 1 });
    await expect(access(path.join(cache.audioDirectory, "old.m4a"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(cache.audioDirectory, "current.m4a"))).resolves.toMatchObject({ size: 1_200 });
    await expect(cache.getStats()).resolves.toMatchObject({ protectedFileCount: 1 });
  });

  it("clears every unused file but never a leased file", async () => {
    const userData = await temporaryDirectory("neoares-cache-");
    const cache = new MediaCache(userData, [], { ...TEST_POLICY, maxBytes: 5_000, cleanupTargetBytes: 4_000 });
    await mkdir(cache.audioDirectory, { recursive: true });
    await writeFile(path.join(cache.audioDirectory, "leased.webm"), Buffer.alloc(1_200, 1));
    await writeFile(path.join(cache.audioDirectory, "unused.webm"), Buffer.alloc(1_200, 2));
    await cache.initialize();
    cache.acquire("leased");

    await expect(cache.clearUnused()).resolves.toMatchObject({ bytesAfter: 1_200, removedFiles: 1 });
    await expect(stat(path.join(cache.audioDirectory, "leased.webm"))).resolves.toMatchObject({ size: 1_200 });
    cache.release("leased");
    await expect(cache.clearUnused()).resolves.toMatchObject({ bytesAfter: 0, removedFiles: 1 });
  });

  it("persists loudness analysis with the cached source", async () => {
    const userData = await temporaryDirectory("neoares-cache-");
    const cache = new MediaCache(userData, [], { ...TEST_POLICY, maxBytes: 5_000, cleanupTargetBytes: 4_000 });
    await mkdir(cache.audioDirectory, { recursive: true });
    const audioPath = path.join(cache.audioDirectory, "normalized.m4a");
    await writeFile(audioPath, Buffer.alloc(1_200, 1));
    await cache.initialize();
    await cache.record("normalized", audioPath);
    await cache.saveLoudness("normalized", {
      integratedLufs: -18,
      samplePeakDbfs: -2,
      recommendedGainDb: 4,
      targetLufs: -14,
      ceilingDbfs: -1,
      analysisVersion: "loudness-v2",
    });

    const reloaded = new MediaCache(userData, [], { ...TEST_POLICY, maxBytes: 5_000, cleanupTargetBytes: 4_000 });
    await reloaded.initialize();

    expect(reloaded.getLoudness("normalized")).toMatchObject({ integratedLufs: -18, recommendedGainDb: 4 });
  });

  async function retentionFixture() {
    const userData = await temporaryDirectory("neoares-retention-");
    const cache = new MediaCache(userData, [], { ...TEST_POLICY, maxBytes: 100_000, cleanupTargetBytes: 90_000 });
    await mkdir(cache.audioDirectory, { recursive: true });
    for (let index = 1; index <= 13; index++) await writeFile(path.join(cache.audioDirectory, `track${index}.m4a`), Buffer.alloc(1200, index));
    await cache.initialize();
    const snapshot = { queue: Array.from({ length: 13 }, (_, index) => ({ id: `track${index + 1}` })), currentIndex: 8 } as SessionSnapshot;
    return { cache, userData, snapshot };
  }

  it("implements the exact nine-track example and preserves all upcoming audio", async () => {
    const { cache, snapshot } = await retentionFixture();
    expect(await cache.retainSession(snapshot)).toMatchObject({ removedFiles: 4, bytesAfter: 9 * 1200 });
    for (let index = 1; index <= 4; index++) await expect(access(path.join(cache.audioDirectory, `track${index}.m4a`))).rejects.toMatchObject({ code: "ENOENT" });
    for (let index = 5; index <= 13; index++) await expect(stat(path.join(cache.audioDirectory, `track${index}.m4a`))).resolves.toMatchObject({ size: 1200 });
    expect(await cache.clearUnused()).toMatchObject({ removedFiles: 0 });
  });
  it("defers leased retired audio and collects immediately after its final release", async () => {
    const { cache, snapshot } = await retentionFixture(); cache.acquire("track1"); cache.acquire("track1");
    expect(await cache.retainSession(snapshot)).toMatchObject({ removedFiles: 3 });
    cache.release("track1"); await cache.collectRetired(); await expect(access(path.join(cache.audioDirectory, "track1.m4a"))).resolves.toBeUndefined();
    cache.release("track1"); await cache.collectRetired(); await expect(access(path.join(cache.audioDirectory, "track1.m4a"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("persists deferred retirement across restart and protects repeated IDs in the reserve", async () => {
    const { cache, snapshot, userData } = await retentionFixture(); cache.acquire("track1");
    snapshot.queue[12] = { ...snapshot.queue[12], id: "track2" };
    await cache.retainSession(snapshot);
    await expect(access(path.join(cache.audioDirectory, "track2.m4a"))).resolves.toBeUndefined();
    const restarted = new MediaCache(userData, [], { ...TEST_POLICY, maxBytes: 100_000, cleanupTargetBytes: 90_000 });
    restarted.protect(snapshot.queue.slice(4).map(track => track.id)); await restarted.initialize();
    await expect(access(path.join(cache.audioDirectory, "track1.m4a"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(cache.audioDirectory, "track2.m4a"))).resolves.toBeUndefined();
  });
  it("serializes simultaneous collectors without double-counting or deleting protected audio", async () => {
    const { cache, snapshot } = await retentionFixture();
    const results = await Promise.all([cache.retainSession(snapshot), cache.collectRetired(), cache.cleanup(), cache.clearUnused()]);
    expect(results.reduce((sum, result) => sum + result.removedFiles, 0)).toBe(4);
    expect(await cache.getStats()).toMatchObject({ audioFileCount: 9, protectedFileCount: 9 });
  });
  it("removes every managed encoding of a retired source and accounts for all their bytes", async () => {
    const { cache, snapshot } = await retentionFixture();
    await writeFile(path.join(cache.audioDirectory, "track1.webm"), Buffer.alloc(1500, 1));
    expect(await cache.getStats()).toMatchObject({ audioFileCount: 14, totalBytes: 17100 });
    expect(await cache.retainSession(snapshot)).toMatchObject({ bytesBefore: 17100, bytesAfter: 10800, removedFiles: 5, removedBytes: 6300 });
    await expect(access(path.join(cache.audioDirectory, "track1.m4a"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(path.join(cache.audioDirectory, "track1.webm"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
