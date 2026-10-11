import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourceService } from "./source-service";

// Execute actual child processes on both Windows and POSIX. Test fixtures are
// Node scripts, not shell/shebang executables (which Windows cannot spawn).
const fixtureTools = vi.hoisted(() => new Set<string>());
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: (executable: string, args: string[], options: import("node:child_process").SpawnOptions) =>
    fixtureTools.has(executable) ? actual.spawn(process.execPath, [executable, ...args], options) : actual.spawn(executable, args, options) };
});

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
  fixtureTools.clear();
});

async function tool(directory: string, name: string, source: string): Promise<string> {
  const executable = path.join(directory, `${name}.cjs`);
  await writeFile(executable, source);
  fixtureTools.add(executable);
  return executable;
}

describe("SourceService.prepare", () => {
  it("reuses a cached audio file without downloading it again", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-source-"));
    temporaryDirectories.push(directory);
    const bytes = new Uint8Array(2_048).fill(7);
    await writeFile(path.join(directory, "oWBf9hfW_4Y.m4a"), bytes);
    const service = new SourceService(directory);

    const prepared = await service.prepare({
      id: "oWBf9hfW_4Y",
      canonicalUrl: "https://www.youtube.com/watch?v=oWBf9hfW_4Y",
      title: "La Rebelión",
      creator: "Joe Arroyo",
      durationSeconds: 285,
      thumbnailUrl: null,
    });

    expect(prepared.byteLength).toBe(bytes.byteLength);
    expect(prepared.format).toBe("m4a");
    await expect(service.read(prepared.leaseId)).resolves.toEqual(bytes);
  });

  it("rejects an invalid source before preparing audio", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-source-"));
    temporaryDirectories.push(directory);
    const service = new SourceService(directory);

    await expect(service.prepare({
      id: "invalid",
      canonicalUrl: "https://example.com/not-a-track",
      title: "Invalid",
      creator: "Invalid",
      durationSeconds: 0,
      thumbnailUrl: null,
    })).rejects.toThrow("SOURCE_REFERENCE_INVALID");
  });

  it("coalesces concurrent preparation for the same source but gives each reader an independent lease", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-source-single-flight-")); temporaryDirectories.push(directory);
    const audioPath = path.join(directory, "oWBf9hfW_4Y.m4a"), callPath = path.join(directory, "calls.txt");
    const executable = await tool(directory, "download-tool", `
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(callPath)}, 'call\\n');
fs.writeFileSync(${JSON.stringify(audioPath)}, Buffer.alloc(2048, 7));
console.log(${JSON.stringify(audioPath)});
`);
    const service = new SourceService(directory, executable);
    const source = { id: "oWBf9hfW_4Y", canonicalUrl: "https://www.youtube.com/watch?v=oWBf9hfW_4Y", title: "Test", creator: "Test", durationSeconds: 180, thumbnailUrl: null };
    const [first, second] = await Promise.all([service.prepare(source, "playback"), service.prepare(source, "playback")]);
    expect(await readFile(callPath, "utf8")).toBe("call\n"); expect(first.leaseId).not.toBe(second.leaseId);
    service.release(first.leaseId); await expect(service.read(first.leaseId)).rejects.toThrow("SOURCE_PREPARED_UNAVAILABLE");
    expect((await service.read(second.leaseId)).length).toBe(2048); service.releaseAllLeases(); service.releaseAllLeases();
    await expect(service.read(second.leaseId)).rejects.toThrow("SOURCE_PREPARED_UNAVAILABLE");
  });
});

describe("SourceService.searchMany", () => {
  it("groups multiple queries returned by one executable invocation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-search-"));
    temporaryDirectories.push(directory);
    const executable = await tool(directory, "catalog-tool", `
console.log('{"id":"track-a","title":"Track A","uploader":"Artist A","duration":180,"playlist_id":"artist one"}');
console.log('{"id":"track-b","title":"Track B","uploader":"Artist B","duration":200,"playlist_id":"artist two"}');
`);
    const service = new SourceService(directory, executable);

    const groups = await service.searchMany(["artist one", "artist two"], 6);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["track-a"], ["track-b"]]);
  });

  it("keeps valid partial search output when the executable exits with an error", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-search-"));
    temporaryDirectories.push(directory);
    const executable = await tool(directory, "partial-catalog-tool", `
console.log('{"id":"track-a","title":"Track A","uploader":"Artist A","duration":180,"playlist_id":"artist one"}');
process.exitCode = 1;
`);
    const service = new SourceService(directory, executable);

    const groups = await service.searchMany(["artist one", "artist two"], 6);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["track-a"], []]);
  });
});

describe("SourceService cancellation", () => {
  it("invalidates preparation cancelled before the external process has spawned", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-preflight-cancel-")); temporaryDirectories.push(directory);
    const service = new SourceService(directory, "/unused/preflight-test-tool");
    const preparing = service.prepare({ id: "oWBf9hfW_4Y", canonicalUrl: "https://www.youtube.com/watch?v=oWBf9hfW_4Y", title: "Test", creator: "Test", durationSeconds: 180, thumbnailUrl: null }, "playback");
    expect(service.cancelPlayback()).toBe(0);
    await expect(preparing).rejects.toThrow("SOURCE_OPERATION_CANCELLED");
  });
  it("cancels an in-flight preparation process", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-cancel-"));
    temporaryDirectories.push(directory);
    const ready = path.join(directory, "ready");
    const executable = await tool(directory, "slow-media-tool", `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setTimeout(() => {}, 10000);`);
    const service = new SourceService(directory, executable);
    const preparation = service.prepare({
      id: "oWBf9hfW_4Y",
      canonicalUrl: "https://www.youtube.com/watch?v=oWBf9hfW_4Y",
      title: "La Rebelión",
      creator: "Joe Arroyo",
      durationSeconds: 285,
      thumbnailUrl: null,
    }, "playback");

    const rejected = expect(preparation).rejects.toThrow();
    await waitForSpawn(ready);

    expect(service.cancelPlayback()).toBe(1);
    await rejected;
    expect(service.cancelPlayback()).toBe(0);
  });

  it("keeps user searches running when preparation is cancelled", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-cancel-"));
    temporaryDirectories.push(directory);
    const ready = path.join(directory, "ready");
    const executable = await tool(directory, "slow-search-tool", `require('node:fs').writeFileSync(${JSON.stringify(ready)}, 'ready'); setTimeout(() => {}, 10000);`);
    const service = new SourceService(directory, executable);
    const search = service.searchMany(["salsa"], 1);

    const rejected = expect(search).rejects.toThrow();
    await waitForSpawn(ready);

    expect(service.cancelPlayback()).toBe(0);
    expect(service.cancelAll()).toBe(1);
    await rejected;
  });
});

async function waitForSpawn(marker: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 4000) {
    try { await readFile(marker); return; } catch { /* Wait for actual process startup. */ }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("Test fixture process did not start");
}
