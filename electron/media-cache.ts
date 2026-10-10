import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheCleanupResult, CachePolicy, CacheStats, LoudnessAnalysis, SessionSnapshot } from "../src/shared/contracts";
import { playbackRetention } from "../src/domain/playback-retention";

type CacheEntry = {
  sourceId: string;
  fileName: string;
  fileNames?: string[];
  byteLength: number;
  createdAt: string;
  lastAccessedAt: string;
  loudness?: LoudnessAnalysis;
};

type CacheIndex = {
  schemaVersion: 1;
  policy: CachePolicy;
  entries: Record<string, CacheEntry>;
  updatedAt: string;
  retiredSourceIds?: string[];
};

export const DEFAULT_CACHE_POLICY: CachePolicy = {
  maxBytes: 1024 * 1024 * 1024,
  cleanupTargetBytes: 750 * 1024 * 1024,
  maxUnusedAgeDays: 30,
  partialMaxAgeMinutes: 60,
  sweepIntervalMinutes: 30,
};

export class MediaCache {
  readonly rootDirectory: string;
  readonly audioDirectory: string;
  readonly indexPath: string;
  readonly #leaseCounts = new Map<string, number>();
  readonly #sessionProtectedIds = new Set<string>();
  #index: CacheIndex;
  #writeChain: Promise<void> = Promise.resolve();
  #cleanupChain: Promise<unknown> = Promise.resolve();
  #reconcileChain: Promise<void> = Promise.resolve();

  constructor(
    userDataDirectory: string,
    private readonly legacyDirectories: string[] = [],
    policy: CachePolicy = DEFAULT_CACHE_POLICY,
  ) {
    this.rootDirectory = path.join(userDataDirectory, "MediaCache");
    this.audioDirectory = path.join(this.rootDirectory, "audio");
    this.indexPath = path.join(this.rootDirectory, "cache-index.json");
    this.#index = emptyIndex(policy);
  }

  async initialize(): Promise<CacheCleanupResult> {
    await mkdir(this.audioDirectory, { recursive: true });
    this.#index = await this.#loadIndex();
    await this.#migrateLegacyDirectories();
    await this.#reconcileIndex();
    return this.cleanup();
  }

  getPolicy(): CachePolicy {
    return { ...this.#index.policy };
  }

  async savePolicy(policy: CachePolicy): Promise<void> {
    assertCachePolicy(policy);
    this.#index.policy = { ...policy };
    await this.#saveIndex();
    await this.cleanup();
  }

  async getStats(): Promise<CacheStats> {
    await this.#reconcileIndex();
    const entries = Object.values(this.#index.entries);
    const partials = await this.#partialFiles();
    return {
      totalBytes: entries.reduce((sum, entry) => sum + entry.byteLength, 0),
      audioFileCount: entries.reduce((sum, entry) => sum + (entry.fileNames?.length ?? 1), 0),
      partialFileCount: partials.length,
      protectedFileCount: entries.filter(({ sourceId }) => this.isProtected(sourceId)).reduce((sum, entry) => sum + (entry.fileNames?.length ?? 1), 0),
      oldestAccessedAt: entries.map(({ lastAccessedAt }) => lastAccessedAt).sort()[0] ?? null,
    };
  }

  async record(sourceId: string, filePath: string): Promise<void> {
    const resolved = path.resolve(filePath);
    if (path.dirname(resolved) !== path.resolve(this.audioDirectory)) throw new Error("CACHE_PATH_OUTSIDE_ROOT");
    const fileStats = await stat(resolved);
    await this.#reconcileIndex();
    const now = new Date().toISOString();
    const previous = this.#index.entries[sourceId];
    this.#index.entries[sourceId] = {
      sourceId,
      fileName: path.basename(resolved),
      fileNames: previous?.fileNames ?? [path.basename(resolved)],
      byteLength: previous?.byteLength ?? fileStats.size,
      createdAt: previous?.createdAt ?? now,
      lastAccessedAt: now,
      ...(previous?.loudness && previous.byteLength === fileStats.size && previous.fileName === path.basename(resolved)
        ? { loudness: previous.loudness }
        : {}),
    };
    await this.#saveIndex();
    if (await this.#totalBytes() > this.#index.policy.maxBytes) await this.cleanup();
  }

  async touch(sourceId: string): Promise<void> {
    const entry = this.#index.entries[sourceId];
    if (!entry) return;
    entry.lastAccessedAt = new Date().toISOString();
    await this.#saveIndex();
  }

  getLoudness(sourceId: string): LoudnessAnalysis | null {
    return this.#index.entries[sourceId]?.loudness ?? null;
  }

  async saveLoudness(sourceId: string, analysis: LoudnessAnalysis): Promise<void> {
    assertLoudnessAnalysis(analysis);
    const entry = this.#index.entries[sourceId];
    if (!entry) return;
    entry.loudness = { ...analysis };
    await this.#saveIndex();
  }

  acquire(sourceId: string): void {
    this.#leaseCounts.set(sourceId, (this.#leaseCounts.get(sourceId) ?? 0) + 1);
  }

  release(sourceId: string): void {
    const count = this.#leaseCounts.get(sourceId) ?? 0;
    if (count <= 1) this.#leaseCounts.delete(sourceId);
    else this.#leaseCounts.set(sourceId, count - 1);
    if (this.#index.retiredSourceIds?.includes(sourceId)) {
      void this.collectRetired().catch(cause => console.warn("[cache] deferred-collection-failed", cause));
    }
  }

  protect(sourceIds: string[]): void {
    this.#sessionProtectedIds.clear();
    for (const sourceId of sourceIds.filter(Boolean)) this.#sessionProtectedIds.add(sourceId);
  }

  /** Register retirement independently of the age/size eviction policy. */
  async retainSession(snapshot: SessionSnapshot): Promise<CacheCleanupResult> {
    const { protectedIds, retiredIds } = playbackRetention(snapshot.queue, snapshot.currentIndex);
    this.protect(protectedIds);
    const protectedSet = new Set(protectedIds);
    this.#index.retiredSourceIds = [...new Set([...(this.#index.retiredSourceIds ?? []), ...retiredIds])]
      .filter(id => !protectedSet.has(id));
    return this.collectRetired();
  }

  collectRetired(): Promise<CacheCleanupResult> {
    return this.#serializeCleanup(() => this.#runCleanup(false, true));
  }

  isProtected(sourceId: string): boolean {
    return this.#sessionProtectedIds.has(sourceId) || (this.#leaseCounts.get(sourceId) ?? 0) > 0;
  }

  cleanup(clearAllUnused = false): Promise<CacheCleanupResult> {
    return this.#serializeCleanup(() => this.#runCleanup(clearAllUnused, false));
  }

  #serializeCleanup<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.#cleanupChain.catch(() => undefined).then(operation);
    this.#cleanupChain = pending;
    return pending;
  }

  async #runCleanup(clearAllUnused: boolean, retiredOnly: boolean): Promise<CacheCleanupResult> {
    await this.#reconcileIndex();
    await this.#removeExpiredPartials();
    const entries = Object.values(this.#index.entries);
    const bytesBefore = entries.reduce((sum, entry) => sum + entry.byteLength, 0);
    const staleBefore = Date.now() - this.#index.policy.maxUnusedAgeDays * 24 * 60 * 60 * 1_000;
    let totalBytes = bytesBefore;
    let removedFiles = 0;
    let removedBytes = 0;

    const budgetCleanupActive = bytesBefore > this.#index.policy.maxBytes;
    const candidates = entries
      .filter(({ sourceId }) => !this.isProtected(sourceId))
      .sort((a, b) => Date.parse(a.lastAccessedAt) - Date.parse(b.lastAccessedAt));

    for (const entry of candidates) {
      const olderThanPolicy = Date.parse(entry.lastAccessedAt) < staleBefore;
      const overCleanupTarget = budgetCleanupActive && totalBytes > this.#index.policy.cleanupTargetBytes;
      const retired = this.#index.retiredSourceIds?.includes(entry.sourceId) === true;
      const shouldRemove = retired || (!retiredOnly && (clearAllUnused || olderThanPolicy || overCleanupTarget));
      if (!shouldRemove) continue;
      for (const fileName of entry.fileNames ?? [entry.fileName]) {
        const managedPath = path.resolve(this.audioDirectory, fileName);
        if (path.dirname(managedPath) !== path.resolve(this.audioDirectory)) throw new Error("CACHE_PATH_OUTSIDE_ROOT");
        try {
          const fileStats = await stat(managedPath);
          if (this.isProtected(entry.sourceId)) break;
          await unlink(managedPath);
          totalBytes -= fileStats.size;
          removedFiles += 1;
          removedBytes += fileStats.size;
        } catch (error) {
          if (!isMissingFile(error)) throw error;
        }
      }
    }

    await this.#reconcileIndex();
    totalBytes = await this.#totalBytes();
    this.#index.retiredSourceIds = this.#index.retiredSourceIds?.filter(id => Boolean(this.#index.entries[id]) || (this.#leaseCounts.get(id) ?? 0) > 0);

    await this.#saveIndex();
    return { bytesBefore, bytesAfter: Math.max(0, totalBytes), removedFiles, removedBytes };
  }

  async clearUnused(): Promise<CacheCleanupResult> {
    return this.cleanup(true);
  }

  async #loadIndex(): Promise<CacheIndex> {
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, "utf8")) as unknown;
      if (isCacheIndex(parsed)) return parsed;
    } catch (error) {
      if (!isMissingFile(error) && !(error instanceof SyntaxError)) throw error;
    }
    return emptyIndex(this.#index.policy);
  }

  #reconcileIndex(): Promise<void> {
    this.#reconcileChain = this.#reconcileChain.catch(() => undefined).then(() => this.#runReconcileIndex());
    return this.#reconcileChain;
  }

  async #runReconcileIndex(): Promise<void> {
    await mkdir(this.audioDirectory, { recursive: true });
    const names = await readdir(this.audioDirectory);
    const existing = new Set<string>();
    for (const fileName of names) {
      const match = /^(.+)\.(m4a|webm)$/i.exec(fileName);
      if (!match) continue;
      const sourceId = match[1];
      let fileStats;
      try { fileStats = await stat(path.join(this.audioDirectory, fileName)); }
      catch (error) { if (isMissingFile(error)) continue; throw error; }
      if (!fileStats.isFile() || fileStats.size <= 1_024) continue;
      if (existing.has(sourceId)) {
        const entry = this.#index.entries[sourceId];
        entry.fileNames!.push(fileName);
        entry.byteLength += fileStats.size;
        continue;
      }
      existing.add(sourceId);
      const previous = this.#index.entries[sourceId];
      this.#index.entries[sourceId] = {
        sourceId,
        fileName,
        fileNames: [fileName],
        byteLength: fileStats.size,
        createdAt: previous?.createdAt ?? fileStats.birthtime.toISOString(),
        lastAccessedAt: previous?.lastAccessedAt ?? fileStats.mtime.toISOString(),
        ...(previous?.loudness ? { loudness: previous.loudness } : {}),
      };
    }
    for (const sourceId of Object.keys(this.#index.entries)) {
      if (!existing.has(sourceId)) delete this.#index.entries[sourceId];
    }
    await this.#saveIndex();
  }

  async #migrateLegacyDirectories(): Promise<void> {
    for (const directory of [...new Set(this.legacyDirectories.map((value) => path.resolve(value)))]) {
      if (directory === path.resolve(this.audioDirectory)) continue;
      let names: string[];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (isMissingFile(error)) continue;
        throw error;
      }
      for (const fileName of names) {
        const audioMatch = /^(.+)\.(m4a|webm)$/i.exec(fileName);
        const sourcePath = path.join(directory, fileName);
        if (!audioMatch) {
          if (isPartialFile(fileName)) {
            // A legacy downloader is not active when this single-instance app starts.
            await unlink(sourcePath);
          }
          continue;
        }
        const destinationPath = path.join(this.audioDirectory, fileName);
        try {
          await copyFile(sourcePath, destinationPath, constants.COPYFILE_EXCL);
        } catch (error) {
          if (!isExistingFile(error)) throw error;
          const [sourceStats, destinationStats] = await Promise.all([stat(sourcePath), stat(destinationPath)]);
          if (sourceStats.size > destinationStats.size) {
            const temporary = `${destinationPath}.migration`;
            await copyFile(sourcePath, temporary);
            await rename(temporary, destinationPath);
          }
        }
        const [sourceStats, destinationStats] = await Promise.all([stat(sourcePath), stat(destinationPath)]);
        if (destinationStats.size < sourceStats.size) throw new Error("CACHE_MIGRATION_VERIFICATION_FAILED");
        await unlink(sourcePath);
      }
      try {
        await rmdir(directory);
      } catch (error) {
        if (!isMissingFile(error) && !isDirectoryNotEmpty(error)) throw error;
      }
    }
  }

  async #removeExpiredPartials(): Promise<void> {
    const expiry = Date.now() - this.#index.policy.partialMaxAgeMinutes * 60 * 1_000;
    for (const fileName of await this.#partialFiles()) {
      const filePath = path.join(this.audioDirectory, fileName);
      const fileStats = await stat(filePath);
      if (fileStats.mtimeMs < expiry) await unlink(filePath);
    }
  }

  async #partialFiles(): Promise<string[]> {
    const names = await readdir(this.audioDirectory);
    return names.filter(isPartialFile);
  }

  async #totalBytes(): Promise<number> {
    return Object.values(this.#index.entries).reduce((sum, entry) => sum + entry.byteLength, 0);
  }

  async #saveIndex(): Promise<void> {
    this.#index.updatedAt = new Date().toISOString();
    const serialized = `${JSON.stringify(this.#index, null, 2)}\n`;
    const temporary = `${this.indexPath}.tmp`;
    this.#writeChain = this.#writeChain.catch(() => undefined).then(async () => {
      await mkdir(this.rootDirectory, { recursive: true });
      await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.indexPath);
    });
    await this.#writeChain;
  }
}

function emptyIndex(policy: CachePolicy): CacheIndex {
  return { schemaVersion: 1, policy: { ...policy }, entries: {}, updatedAt: new Date(0).toISOString() };
}

function assertCachePolicy(policy: CachePolicy): void {
  if (!Number.isFinite(policy.maxBytes)
    || !Number.isFinite(policy.cleanupTargetBytes)
    || policy.maxBytes <= 0
    || policy.cleanupTargetBytes <= 0
    || policy.cleanupTargetBytes > policy.maxBytes
    || policy.maxUnusedAgeDays <= 0
    || policy.partialMaxAgeMinutes <= 0
    || policy.sweepIntervalMinutes <= 0) {
    throw new Error("CACHE_POLICY_INVALID");
  }
}

function isCacheIndex(value: unknown): value is CacheIndex {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.policy) || !isRecord(value.entries)) return false;
  try {
    assertCachePolicy(value.policy as CachePolicy);
    return (value.retiredSourceIds === undefined || (Array.isArray(value.retiredSourceIds) && value.retiredSourceIds.every(id => typeof id === "string")))
      && Object.values(value.entries).every((entry) => isRecord(entry)
      && typeof entry.sourceId === "string"
      && typeof entry.fileName === "string"
      && path.basename(entry.fileName) === entry.fileName
      && (entry.fileNames === undefined || (Array.isArray(entry.fileNames) && entry.fileNames.every(name => typeof name === "string" && path.basename(name) === name)))
      && typeof entry.byteLength === "number"
      && typeof entry.createdAt === "string"
      && typeof entry.lastAccessedAt === "string"
      && (!("loudness" in entry) || isLoudnessAnalysis(entry.loudness)));
  } catch {
    return false;
  }
}

function assertLoudnessAnalysis(value: LoudnessAnalysis): void {
  if (!isLoudnessAnalysis(value)) throw new Error("LOUDNESS_ANALYSIS_INVALID");
}

function isLoudnessAnalysis(value: unknown): value is LoudnessAnalysis {
  return isRecord(value)
    && value.analysisVersion === "loudness-v2"
    && [value.integratedLufs, value.samplePeakDbfs, value.recommendedGainDb, value.targetLufs, value.ceilingDbfs]
      .every((number) => typeof number === "number" && Number.isFinite(number));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isExistingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EEXIST";
}

function isDirectoryNotEmpty(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error.code === "ENOTEMPTY" || error.code === "EEXIST");
}

function isPartialFile(fileName: string): boolean {
  return fileName.endsWith(".part") || fileName.endsWith(".ytdl") || fileName.endsWith(".migration");
}
