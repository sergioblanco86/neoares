import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SourceService } from "./source-service";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

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
    })).rejects.toThrow("fuente válida");
  });
});

describe("SourceService.searchMany", () => {
  it("groups multiple queries returned by one executable invocation", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-search-"));
    temporaryDirectories.push(directory);
    const executable = path.join(directory, "catalog-tool");
    await writeFile(executable, `#!/bin/sh
printf '%s\\n' '{"id":"track-a","title":"Track A","uploader":"Artist A","duration":180,"playlist_id":"artist one"}'
printf '%s\\n' '{"id":"track-b","title":"Track B","uploader":"Artist B","duration":200,"playlist_id":"artist two"}'
`);
    await chmod(executable, 0o700);
    const service = new SourceService(directory, executable);

    const groups = await service.searchMany(["artist one", "artist two"], 6);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["track-a"], ["track-b"]]);
  });

  it("keeps valid partial search output when the executable exits with an error", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-search-"));
    temporaryDirectories.push(directory);
    const executable = path.join(directory, "partial-catalog-tool");
    await writeFile(executable, `#!/bin/sh
printf '%s\\n' '{"id":"track-a","title":"Track A","uploader":"Artist A","duration":180,"playlist_id":"artist one"}'
exit 1
`);
    await chmod(executable, 0o700);
    const service = new SourceService(directory, executable);

    const groups = await service.searchMany(["artist one", "artist two"], 6);

    expect(groups.map((group) => group.map(({ id }) => id))).toEqual([["track-a"], []]);
  });
});
