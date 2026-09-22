import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_DJS } from "../src/domain/default-djs";
import { DjRepository } from "./dj-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("DjRepository.delete", () => {
  it("deletes only the selected persisted DJ", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-djs-"));
    temporaryDirectories.push(directory);
    const repository = new DjRepository(directory);
    await repository.save(DEFAULT_DJS[0]);
    await repository.save(DEFAULT_DJS[1]);

    await repository.delete(DEFAULT_DJS[0].id);

    await expect(repository.list()).resolves.toEqual([DEFAULT_DJS[1]]);
  });

  it("rejects unsafe identifiers", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "neoares-djs-"));
    temporaryDirectories.push(directory);
    const repository = new DjRepository(directory);

    await expect(repository.delete("../otro-archivo")).rejects.toThrow("DJ_ID_INVALID");
  });
});
