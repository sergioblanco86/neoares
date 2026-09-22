import { access, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CachePolicy } from "../src/shared/contracts";
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
});
