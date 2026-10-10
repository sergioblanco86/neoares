import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dialog, BrowserWindow } from "electron";
import converter from "milkdrop-preset-converter";
import { splitPreset } from "milkdrop-preset-utils";
import type { VisualizerImportResult, VisualizerPresentation, VisualizerPresetDescriptor, VisualizerPresetImportRequest, VisualizerSettings } from "../src/shared/contracts";

const DEFAULT_SETTINGS: VisualizerSettings = {
  schemaVersion: 1,
  enabled: true,
  presetId: null,
  autoChange: true,
  changeIntervalSeconds: 25,
  locked: false,
  transitionsEnabled: true,
  transitionSeconds: 3,
  quality: "auto",
  showTrackInfo: true,
  favoritePresetIds: [],
  updatedAt: new Date(0).toISOString(),
};
const MAX_FILES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const DEFAULT_PRESENTATION: VisualizerPresentation = { schemaVersion: 1, x: 0, y: 0, width: 680, height: 428, updatedAt: new Date(0).toISOString() };

type PresetLibrary = { schemaVersion: 1; updatedAt: string; presets: VisualizerPresetDescriptor[] };

export class VisualizerSettingsRepository {
  #writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  async load(): Promise<VisualizerSettings> {
    const value = await readOptionalJson(this.filePath());
    if (value === null) return { ...DEFAULT_SETTINGS };
    if (isSettingsWithoutFavorites(value)) {
      const migrated = { ...value, favoritePresetIds: [] };
      await this.save(migrated);
      return migrated;
    }
    assertSettings(value);
    return value;
  }

  async save(settings: VisualizerSettings): Promise<void> {
    assertSettings(settings);
    this.#writeChain = this.#writeChain.catch(() => undefined).then(() => writeAtomicJson(this.filePath(), settings));
    await this.#writeChain;
  }

  private filePath(): string {
    return path.join(this.dataDirectory, "visualizer", "settings.json");
  }
}

export class VisualizerPresentationRepository {
  #writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly dataDirectory: string) {}

  async load(): Promise<VisualizerPresentation> {
    const value = await readOptionalJson(this.filePath());
    if (value === null) return { ...DEFAULT_PRESENTATION };
    assertPresentation(value);
    return value;
  }

  async save(presentation: VisualizerPresentation): Promise<void> {
    assertPresentation(presentation);
    this.#writeChain = this.#writeChain.catch(() => undefined).then(() => writeAtomicJson(this.filePath(), presentation));
    await this.#writeChain;
  }

  private filePath(): string { return path.join(this.dataDirectory, "visualizer", "presentation.json"); }
}

export class VisualizerPresetLibrary {
  #writeChain: Promise<void> = Promise.resolve();
  #importConfirmed = false;

  constructor(private readonly dataDirectory: string) {}

  async list(): Promise<VisualizerPresetDescriptor[]> {
    return (await this.load()).presets.map(preset => ({ ...preset, bundled: preset.origin === "bundled" }));
  }

  async setFavorite(id: string, favorite: boolean): Promise<void> {
    if (typeof favorite !== "boolean") throw new Error("VISUALIZER_FAVORITE_INVALID");
    await this.update((library) => {
      const preset = library.presets.find((entry) => entry.id === id);
      if (!preset) throw new Error("VISUALIZER_PRESET_NOT_FOUND");
      preset.favorite = favorite;
    });
  }

  async loadDefinition(id: string): Promise<unknown> {
    const preset = (await this.load()).presets.find((entry) => entry.id === id);
    if (!preset || preset.origin !== "imported" || preset.compatibility !== "ready" || !preset.checksum) throw new Error("VISUALIZER_PRESET_NOT_AVAILABLE");
    let definition = JSON.parse(await readFile(path.join(this.presetDirectory(), `${preset.checksum}.json`), "utf8")) as unknown;
    assertConvertiblePreset(definition);
    // Repair presets imported by the earlier converter integration from their
    // managed originals, never from caller-supplied or persisted source paths.
    if (!("init_eqs_eel" in (definition as object))) {
      const source = await readFile(path.join(this.presetDirectory(), `${preset.checksum}.milk`), "utf8");
      definition = await convertMilkDropSource(source);
      await writeAtomicJson(path.join(this.presetDirectory(), `${preset.checksum}.json`), definition);
    }
    return definition;
  }

  async remove(id: string): Promise<void> {
    let checksum: string | null = null;
    await this.update(async (library) => {
      const index = library.presets.findIndex((preset) => preset.id === id);
      if (index < 0) throw new Error("VISUALIZER_PRESET_NOT_FOUND");
      const preset = library.presets[index];
      if (preset.origin !== "imported" || !preset.checksum) throw new Error("VISUALIZER_PRESET_NOT_REMOVABLE");
      library.presets.splice(index, 1);
      checksum = preset.checksum;
    });
    // Commit the registry first. A failed cleanup may leave an orphan, never a
    // live registry entry whose files have already disappeared.
    if (checksum) await Promise.all([
      rm(path.join(this.presetDirectory(), `${checksum}.milk`), { force: true }),
      rm(path.join(this.presetDirectory(), `${checksum}.json`), { force: true }),
    ]);
  }

  async retry(id: string): Promise<VisualizerPresetDescriptor> {
    let result: VisualizerPresetDescriptor | undefined;
    await this.update(async library => {
      const preset = library.presets.find(entry => entry.id === id);
      if (!preset || preset.origin !== "imported" || !preset.checksum) throw new Error("VISUALIZER_PRESET_NOT_AVAILABLE");
      try {
        const source = await readFile(path.join(this.presetDirectory(), `${preset.checksum}.milk`));
        if (createHash("sha256").update(source).digest("hex") !== preset.checksum) throw new Error("VISUALIZER_PRESET_CHECKSUM_MISMATCH");
        const definition = await convertMilkDropSource(source.toString("utf8"));
        await writeAtomicJson(path.join(this.presetDirectory(), `${preset.checksum}.json`), definition);
        preset.compatibility = "ready"; delete preset.compatibilityError;
      } catch (error) {
        preset.compatibility = "incompatible";
        preset.compatibilityError = (error instanceof Error ? error.message : "VISUALIZER_PRESET_CONVERSION_FAILED").slice(0, 1000);
      }
      result = { ...preset, bundled: false };
    });
    return result!;
  }

  async importFromDialog(parent: BrowserWindow, request: VisualizerPresetImportRequest, locale: "es" | "en" = "es"): Promise<VisualizerImportResult> {
    const english = locale === "en";
    if (!this.#importConfirmed) {
      const confirmation = await dialog.showMessageBox(parent, {
        type: "warning",
        buttons: english ? ["Cancel", "Import trusted files"] : ["Cancelar", "Importar archivos de confianza"],
        defaultId: 0, cancelId: 0,
        title: english ? "Import MilkDrop presets" : "Importar presets MilkDrop",
        message: english ? "MilkDrop presets contain executable equations." : "Los presets MilkDrop contienen ecuaciones ejecutables.",
        detail: english ? "Only import local files from a trusted source. NeoAres does not download or import presets from remote sources." : "Importa solo archivos locales de una fuente de confianza. NeoAres no descarga ni acepta presets desde fuentes remotas.",
      });
      if (confirmation.response !== 1) return { importedIds: [], skipped: [], incompatible: [] };
      this.#importConfirmed = true;
    }
    const selection = await dialog.showOpenDialog(parent, request.mode === "directory"
      ? { title: english ? "Import MilkDrop folder" : "Importar carpeta MilkDrop", properties: ["openDirectory"] }
      : { title: english ? "Import MilkDrop presets" : "Importar presets MilkDrop", filters: [{ name: "MilkDrop presets", extensions: ["milk"] }], properties: ["openFile", "multiSelections"] });
    if (selection.canceled) return { importedIds: [], skipped: [], incompatible: [] };
    const sources = request.mode === "directory" ? await collectMilkFiles(selection.filePaths[0]) : selection.filePaths;
    return this.importFiles(sources);
  }

  async importFiles(sourcePaths: string[]): Promise<VisualizerImportResult> {
    const result: VisualizerImportResult = { importedIds: [], skipped: [], incompatible: [] };
    let totalBytes = 0;
    await this.update(async (library) => {
      for (const sourcePath of sourcePaths.slice(0, MAX_FILES)) {
        const name = path.basename(sourcePath);
        try {
          const sourceStat = await lstat(sourcePath);
          if (!sourceStat.isFile() || sourceStat.isSymbolicLink() || path.extname(name).toLowerCase() !== ".milk") {
            result.skipped.push({ sourceName: name, reason: "VISUALIZER_PRESET_INVALID_SOURCE" });
            continue;
          }
          if (sourceStat.size > MAX_FILE_BYTES || totalBytes + sourceStat.size > MAX_TOTAL_BYTES) {
            result.skipped.push({ sourceName: name, reason: "VISUALIZER_PRESET_TOO_LARGE" });
            continue;
          }
          totalBytes += sourceStat.size;
          const sourceBytes = await readFile(sourcePath);
          const source = sourceBytes.toString("utf8");
          const checksum = createHash("sha256").update(sourceBytes).digest("hex");
          const existing = library.presets.find((preset) => preset.checksum === checksum);
          if (existing) {
            result.skipped.push({ sourceName: name, reason: "VISUALIZER_PRESET_DUPLICATE" });
            continue;
          }
          let converted: unknown;
          await mkdir(this.presetDirectory(), { recursive: true });
          const originalPath = path.join(this.presetDirectory(), `${checksum}.milk`);
          const temporary = `${originalPath}.${randomUUID()}.tmp`;
          await writeFile(temporary, sourceBytes, { mode: 0o600 });
          await rename(temporary, originalPath);
          try {
            converted = await convertMilkDropSource(source);
            assertConvertiblePreset(converted);
          } catch (error) {
            const descriptor = createImportedDescriptor(name, checksum, "incompatible");
            descriptor.compatibilityError = (error instanceof Error ? error.message : "VISUALIZER_PRESET_CONVERSION_FAILED").slice(0, 1000);
            library.presets.push(descriptor);
            result.incompatible.push({ sourceName: name, reason: error instanceof Error ? error.message : "VISUALIZER_PRESET_CONVERSION_FAILED" });
            continue;
          }
          await writeAtomicJson(path.join(this.presetDirectory(), `${checksum}.json`), converted);
          const descriptor = createImportedDescriptor(name, checksum, "ready");
          library.presets.push(descriptor);
          result.importedIds.push(descriptor.id);
        } catch (error) {
          result.skipped.push({ sourceName: name, reason: error instanceof Error ? error.message : "VISUALIZER_PRESET_IMPORT_FAILED" });
        }
      }
      if (sourcePaths.length > MAX_FILES) result.skipped.push({ sourceName: "", reason: "VISUALIZER_PRESET_FILE_LIMIT" });
    });
    return result;
  }

  private async load(): Promise<PresetLibrary> {
    const value = await readOptionalJson(this.libraryPath());
    if (value === null) return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), presets: [] };
    assertLibrary(value);
    // Earlier development builds omitted `bundled`. Normalize old entries in
    // memory; the next serialized mutation writes the complete descriptor.
    return { ...value, presets: value.presets.map(preset => ({ ...preset, bundled: preset.origin === "bundled" })) };
  }

  private async update(change: (library: PresetLibrary) => void | Promise<void>): Promise<void> {
    this.#writeChain = this.#writeChain.catch(() => undefined).then(async () => {
      const library = await this.load();
      await change(library);
      library.updatedAt = new Date().toISOString();
      await writeAtomicJson(this.libraryPath(), library);
    });
    await this.#writeChain;
  }

  private libraryPath(): string { return path.join(this.dataDirectory, "visualizer", "presets.json"); }
  private presetDirectory(): string { return path.join(this.dataDirectory, "visualizer", "presets"); }
}

async function convertMilkDropSource(source: string): Promise<unknown> {
  if (!/^\s*\[preset\d+\]/im.test(source)) throw new Error("VISUALIZER_PRESET_INVALID_FORMAT");
  const converted = await converter.convertPreset(source) as Record<string, unknown> & {
    shapes: Record<string, unknown>[]; waves: Record<string, unknown>[];
  };
  assertConvertiblePreset(converted);
  const raw = splitPreset(source);
  // Preserve EEL rather than evaluating the converter's JavaScript strings.
  // Shader conversion remains in Main; the renderer uses WASM exclusively.
  const equations = (set: { init_eqs_str?: string; frame_eqs_str?: string; point_eqs_str?: string }) => ({
    init_eqs_eel: set.init_eqs_str ?? "", frame_eqs_eel: set.frame_eqs_str ?? "", point_eqs_eel: set.point_eqs_str ?? "",
  });
  return {
    ...converted, version: raw.presetVersion,
    init_eqs_eel: raw.presetInit, frame_eqs_eel: raw.perFrame, pixel_eqs_eel: raw.perVertex,
    shapes: converted.shapes.map((shape, index) => ({ ...shape, ...equations(raw.shapes[index] ?? {}) })),
    waves: converted.waves.map((wave, index) => ({ ...wave, ...equations(raw.waves[index] ?? {}) })),
  };
}

async function collectMilkFiles(root: string): Promise<string[]> {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("VISUALIZER_PRESET_INVALID_DIRECTORY");
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (files.length >= MAX_FILES) return;
      const filePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await visit(filePath);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".milk") files.push(filePath);
    }
  }
  await visit(root);
  return files;
}

function createImportedDescriptor(name: string, checksum: string, compatibility: VisualizerPresetDescriptor["compatibility"]): VisualizerPresetDescriptor {
  const title = path.basename(name, ".milk").trim() || "MilkDrop preset";
  return {
    id: `imported-${checksum}`,
    name: title.slice(0, 200),
    author: null,
    kind: "milkdrop",
    bundled: false,
    sourceKey: `imported/${checksum}.json`,
    tags: ["imported", "milkdrop"],
    favorite: false,
    origin: "imported",
    checksum,
    compatibility,
    importedAt: new Date().toISOString(),
  };
}

async function readOptionalJson(filePath: string): Promise<unknown | null> {
  try { return JSON.parse(await readFile(filePath, "utf8")) as unknown; }
  catch (error) { if (isMissingFile(error)) return null; throw error; }
}

async function writeAtomicJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const backup = `${filePath}.bak`;
  try { await copyFile(filePath, backup); } catch (error) { if (!isMissingFile(error)) throw error; }
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

function assertSettings(value: unknown): asserts value is VisualizerSettings {
  if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.enabled !== "boolean"
    || !(value.presetId === null || typeof value.presetId === "string") || typeof value.autoChange !== "boolean"
    || !isIntegerIn(value.changeIntervalSeconds, 10, 600) || typeof value.locked !== "boolean"
    || typeof value.transitionsEnabled !== "boolean" || !isNumberIn(value.transitionSeconds, 0, 10)
    || !["auto", "low", "medium", "high"].includes(String(value.quality)) || typeof value.showTrackInfo !== "boolean"
    || !Array.isArray(value.favoritePresetIds) || value.favoritePresetIds.length > 10_000 || !value.favoritePresetIds.every((id) => typeof id === "string" && id.length > 0 && id.length <= 160)
    || !isTimestamp(value.updatedAt)) throw new Error("VISUALIZER_SETTINGS_INVALID");
}

function isSettingsWithoutFavorites(value: unknown): value is Omit<VisualizerSettings, "favoritePresetIds"> {
  if (!isRecord(value) || "favoritePresetIds" in value) return false;
  const candidate = { ...value, favoritePresetIds: [] };
  try { assertSettings(candidate); return true; } catch { return false; }
}

function assertLibrary(value: unknown): asserts value is PresetLibrary {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isTimestamp(value.updatedAt) || !Array.isArray(value.presets) || !value.presets.every(isPreset)) throw new Error("VISUALIZER_LIBRARY_INVALID");
}

function assertPresentation(value: unknown): asserts value is VisualizerPresentation {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isNumberIn(value.x, -10_000, 10_000) || !isNumberIn(value.y, -10_000, 10_000)
    || !isNumberIn(value.width, 460, 1_920) || !isNumberIn(value.height, 300, 1_200) || !isTimestamp(value.updatedAt)) throw new Error("VISUALIZER_PRESENTATION_INVALID");
}

function isPreset(value: unknown): value is VisualizerPresetDescriptor {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string"
    && (value.author === null || typeof value.author === "string") && (value.kind === "milkdrop" || value.kind === "native")
    && typeof value.sourceKey === "string" && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string")
    && typeof value.favorite === "boolean" && (value.origin === "bundled" || value.origin === "imported")
    && (value.checksum === null || (typeof value.checksum === "string" && /^[a-f0-9]{64}$/.test(value.checksum)))
    && ["ready", "incompatible", "failed"].includes(String(value.compatibility))
    && (value.importedAt === null || isTimestamp(value.importedAt));
}

function assertConvertiblePreset(value: unknown): void {
  if (!isRecord(value) || !Array.isArray(value.waves) || !Array.isArray(value.shapes) || !isRecord(value.baseVals)) throw new Error("VISUALIZER_PRESET_CONVERSION_FAILED");
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isTimestamp(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isIntegerIn(value: unknown, minimum: number, maximum: number): boolean { return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum; }
function isNumberIn(value: unknown, minimum: number, maximum: number): boolean { return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum; }
function isMissingFile(error: unknown): boolean { return error instanceof Error && "code" in error && error.code === "ENOENT"; }
