import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import commonSchema from "../contracts/schemas/common.schema.json";
import djSchema from "../contracts/schemas/dj-profile.schema.json";
import type { DjProfile } from "../src/shared/contracts";

export class DjRepository {
  private readonly validateDj: ValidateFunction<DjProfile>;

  constructor(private readonly dataDirectory: string) {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    ajv.addSchema(commonSchema);
    this.validateDj = ajv.compile<DjProfile>(djSchema);
  }

  async list(): Promise<DjProfile[]> {
    const directory = this.djDirectory();
    await mkdir(directory, { recursive: true });
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json"));

    const profiles = await Promise.all(
      names.map(async (name) => {
        const raw = await readFile(path.join(directory, name), "utf8");
        const parsed: unknown = JSON.parse(raw);
        this.assertValid(parsed);
        return parsed;
      }),
    );

    return profiles.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }

  async save(profile: DjProfile): Promise<DjProfile> {
    this.assertValid(profile);
    const directory = this.djDirectory();
    await mkdir(directory, { recursive: true });

    const destination = path.join(directory, `${profile.id}.json`);
    const temporary = `${destination}.tmp`;
    const backup = `${destination}.bak`;
    const serialized = `${JSON.stringify(profile, null, 2)}\n`;

    try {
      await copyFile(destination, backup);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, destination);
    return profile;
  }

  async delete(id: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("DJ_ID_INVALID");
    const basePath = path.join(this.djDirectory(), id);
    await Promise.all([".json", ".json.bak", ".json.tmp"].map(async (suffix) => {
      try {
        await unlink(`${basePath}${suffix}`);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }));
  }

  private djDirectory(): string {
    return path.join(this.dataDirectory, "djs");
  }

  private assertValid(value: unknown): asserts value is DjProfile {
    if (!this.validateDj(value)) {
      const detail = this.validateDj.errors
        ?.map((error) => `${error.instancePath || "/"} ${error.message ?? "es inválido"}`)
        .join("; ");
      throw new Error(`DJ_PROFILE_INVALID: ${detail ?? "contrato inválido"}`);
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
