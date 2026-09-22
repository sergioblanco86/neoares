import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseYouTubeUrl } from "../src/adapters/youtube/parse-youtube-url";
import type { PreparedYouTubeSource, SourceRequestScope, YouTubeSource } from "../src/shared/contracts";
import type { MediaCache } from "./media-cache";

type YtDlpMetadata = {
  id?: unknown;
  title?: unknown;
  uploader?: unknown;
  channel?: unknown;
  duration?: unknown;
  thumbnail?: unknown;
  playlist?: unknown;
  playlist_id?: unknown;
};

type Lease = {
  filePath: string;
  source: PreparedYouTubeSource;
};

type SpawnedProcess = ReturnType<typeof spawn>;
type SourceOperation = "search" | "inspect" | "download";
type ActiveProcess = { operation: SourceOperation; scope: SourceRequestScope };

const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const SEARCH_BASE_TIMEOUT_MS = 9_000;
const SEARCH_PER_QUERY_TIMEOUT_MS = 3_000;
const SEARCH_MAX_TIMEOUT_MS = 24_000;
const INSPECT_TIMEOUT_MS = 12_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

export class SourceService {
  readonly #leases = new Map<string, Lease>();
  readonly #activeProcesses = new Map<SpawnedProcess, ActiveProcess>();

  constructor(
    private readonly cacheRoot: string,
    private readonly executableOverride?: string,
    private readonly mediaCache?: MediaCache,
  ) {}

  async search(queryInput: string, requestedLimit: number, scope: SourceRequestScope = "user"): Promise<YouTubeSource[]> {
    return (await this.searchMany([queryInput], requestedLimit, scope))[0] ?? [];
  }

  async searchMany(queryInputs: string[], requestedLimit: number, scope: SourceRequestScope = "user"): Promise<YouTubeSource[][]> {
    const queries = [...new Set(queryInputs.map((query) => query.trim().slice(0, 160)).filter(Boolean))].slice(0, 8);
    const limit = Math.min(10, Math.max(1, Math.trunc(requestedLimit)));
    if (queries.length === 0) throw new Error("SOURCE_SEARCH_EMPTY");

    const ytDlp = this.executableOverride ?? await resolveExecutable("yt-dlp");
    const output = await run(ytDlp, [
      "--flat-playlist",
      "--dump-json",
      "--no-warnings",
      "--playlist-end",
      String(limit),
      "--socket-timeout",
      "8",
      "--extractor-retries",
      "1",
      "--js-runtimes",
      "node",
      ...queries.map((query) => `ytsearch${limit}:${query}`),
    ], "search", Math.min(SEARCH_MAX_TIMEOUT_MS, SEARCH_BASE_TIMEOUT_MS + queries.length * SEARCH_PER_QUERY_TIMEOUT_MS), this.#activeProcesses, scope);

    const grouped = new Map(queries.map((query) => [query, [] as YouTubeSource[]]));
    for (const line of output.split(/\r?\n/).filter(Boolean)) {
      try {
        const metadata = JSON.parse(line) as YtDlpMetadata;
        if (typeof metadata.id !== "string") continue;
        const query = typeof metadata.playlist_id === "string"
          ? metadata.playlist_id
          : typeof metadata.playlist === "string" ? metadata.playlist : null;
        if (!query || !grouped.has(query)) continue;
        const canonicalUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(metadata.id)}`;
        grouped.get(query)!.push(normalizeMetadata(metadata, metadata.id, canonicalUrl));
      } catch {
        // Ignore malformed result lines and keep the valid partial response.
      }
    }
    return queries.map((query) => grouped.get(query) ?? []);
  }

  async inspect(input: string, scope: SourceRequestScope = "user"): Promise<YouTubeSource> {
    const reference = parseYouTubeUrl(input);
    if (!reference || reference.kind !== "VIDEO") {
      throw new Error("SOURCE_URL_INVALID");
    }

    const ytDlp = this.executableOverride ?? await resolveExecutable("yt-dlp");
    const output = await run(ytDlp, [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      reference.canonicalUrl,
    ], "inspect", INSPECT_TIMEOUT_MS, this.#activeProcesses, scope);

    let metadata: YtDlpMetadata;
    try {
      metadata = JSON.parse(output) as YtDlpMetadata;
    } catch {
      throw new Error("SOURCE_METADATA_INVALID");
    }

    return normalizeMetadata(metadata, reference.id, reference.canonicalUrl);
  }

  async prepare(input: YouTubeSource, scope: SourceRequestScope = "user"): Promise<PreparedYouTubeSource> {
    const metadata = normalizePreparationSource(input);
    this.mediaCache?.acquire(metadata.id);
    try {
      const ytDlp = this.executableOverride ?? await resolveExecutable("yt-dlp");
      await mkdir(this.cacheRoot, { recursive: true });

      let filePath = await findCachedAudio(this.cacheRoot, metadata.id);
      if (!filePath) {
        const outputTemplate = path.join(this.cacheRoot, `${metadata.id}.%(ext)s`);
        const output = await run(ytDlp, [
          "--no-playlist",
          "--no-warnings",
          "--format",
          "bestaudio[ext=m4a]/bestaudio",
          "--socket-timeout",
          "8",
          "--retries",
          "1",
          "--fragment-retries",
          "1",
          "--js-runtimes",
          "node",
          "--output",
          outputTemplate,
          "--print",
          "after_move:filepath",
          metadata.canonicalUrl,
        ], "download", DOWNLOAD_TIMEOUT_MS, this.#activeProcesses, scope);

        const reportedPath = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
        if (!reportedPath) throw new Error("SOURCE_AUDIO_FILE_MISSING");
        filePath = path.resolve(reportedPath);
      }

      const cacheRoot = path.resolve(this.cacheRoot);
      if (path.dirname(filePath) !== cacheRoot) {
        throw new Error("SOURCE_PATH_OUTSIDE_CACHE");
      }

      const fileStats = await stat(filePath);
      await this.mediaCache?.record(metadata.id, filePath);
      const leaseId = randomUUID();
      const source: PreparedYouTubeSource = {
        ...metadata,
        leaseId,
        byteLength: fileStats.size,
        format: extensionFormat(filePath),
      };
      this.#leases.set(leaseId, { filePath, source });
      return source;
    } catch (cause) {
      this.mediaCache?.release(metadata.id);
      throw cause;
    }
  }

  async read(leaseId: string): Promise<Uint8Array> {
    const lease = this.#leases.get(leaseId);
    if (!lease) throw new Error("SOURCE_PREPARED_UNAVAILABLE");
    const bytes = new Uint8Array(await readFile(lease.filePath));
    await this.mediaCache?.touch(lease.source.id);
    return bytes;
  }

  release(leaseId: string): void {
    const lease = this.#leases.get(leaseId);
    if (!lease) return;
    this.#leases.delete(leaseId);
    this.mediaCache?.release(lease.source.id);
  }

  cancelPlayback(): number {
    return this.#cancelMatching((active) => active.scope === "playback");
  }

  cancelAll(): number {
    return this.#cancelMatching(() => true);
  }

  #cancelMatching(predicate: (active: ActiveProcess) => boolean): number {
    const matching = [...this.#activeProcesses].filter(([, active]) => predicate(active));
    for (const [child] of matching) terminateProcessTree(child.pid);
    if (matching.length > 0) {
      console.info("[sources] external-call:cancel", {
        activeCount: matching.length,
        operations: [...new Set(matching.map(([, active]) => active.operation))],
      });
    }
    return matching.length;
  }
}

function normalizePreparationSource(input: YouTubeSource): YouTubeSource {
  const canonicalUrl = input && typeof input === "object" && typeof input.canonicalUrl === "string"
    ? input.canonicalUrl
    : "";
  const reference = parseYouTubeUrl(canonicalUrl);
  if (!reference || reference.kind !== "VIDEO") throw new Error("SOURCE_REFERENCE_INVALID");
  const title = typeof input.title === "string" && input.title.trim() ? input.title.trim() : "UNTITLED_VIDEO";
  const creator = typeof input.creator === "string" && input.creator.trim() ? input.creator.trim() : "UNKNOWN_CREATOR";
  const durationSeconds = typeof input.durationSeconds === "number" && Number.isFinite(input.durationSeconds)
    ? Math.max(0, input.durationSeconds)
    : 0;
  const thumbnailUrl = typeof input.thumbnailUrl === "string" ? input.thumbnailUrl : null;
  return { id: reference.id, canonicalUrl: reference.canonicalUrl, title, creator, durationSeconds, thumbnailUrl };
}

async function findCachedAudio(cacheRoot: string, id: string): Promise<string | null> {
  for (const extension of ["m4a", "webm"] as const) {
    const candidate = path.join(cacheRoot, `${id}.${extension}`);
    try {
      const fileStats = await stat(candidate);
      if (fileStats.isFile() && fileStats.size > 1_024) return candidate;
    } catch {
      // Try the next supported cached format.
    }
  }
  return null;
}

function normalizeMetadata(metadata: YtDlpMetadata, fallbackId: string, canonicalUrl: string): YouTubeSource {
  const id = typeof metadata.id === "string" ? metadata.id : fallbackId;
  const title = typeof metadata.title === "string" ? metadata.title : "UNTITLED_VIDEO";
  const creator = typeof metadata.uploader === "string"
    ? metadata.uploader
    : typeof metadata.channel === "string" ? metadata.channel : "UNKNOWN_CREATOR";
  const durationSeconds = typeof metadata.duration === "number" && Number.isFinite(metadata.duration)
    ? metadata.duration
    : 0;
  const thumbnailUrl = typeof metadata.thumbnail === "string"
    ? metadata.thumbnail
    : `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  return { id, canonicalUrl, title, creator, durationSeconds, thumbnailUrl };
}

async function resolveExecutable(name: "yt-dlp"): Promise<string> {
  const bundledName = process.platform === "win32" ? `${name}.exe` : name;
  const candidates = [
    path.join(__dirname, "..", ".tools", bundledName),
    path.join(process.cwd(), ".tools", bundledName),
    path.join(__dirname, "..", ".tools", "venv", "bin", name),
    path.join(process.cwd(), ".tools", "venv", "bin", name),
    path.join("/opt/homebrew/bin", name),
    path.join("/usr/local/bin", name),
    name,
  ];

  for (const candidate of candidates) {
    if (candidate === name) return candidate;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next standard installation path.
    }
  }
  return name;
}

function extensionFormat(filePath: string): PreparedYouTubeSource["format"] {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".m4a") return "m4a";
  if (extension === ".webm") return "webm";
  return "unknown";
}

function run(
  executable: string,
  args: string[],
  operation: SourceOperation,
  timeoutMs: number,
  activeProcesses?: Map<SpawnedProcess, ActiveProcess>,
  scope: SourceRequestScope = "user",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let settled = false;
    console.info("[sources] external-call:start", { operation });
    const child = spawn(executable, args, {
      detached: process.platform !== "win32",
      shell: false,
      windowsHide: true,
    });
    activeProcesses?.set(child, { operation, scope });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let totalBytes = 0;

    const complete = (output: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeProcesses?.delete(child);
      console.info("[sources] external-call:complete", { durationMs: Date.now() - startedAt, operation });
      resolve(output);
    };

    const fail = (error: Error, extra: Record<string, unknown> = {}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeProcesses?.delete(child);
      console.error("[sources] external-call:error", { durationMs: Date.now() - startedAt, operation, ...extra });
      reject(error);
    };

    const timeout = setTimeout(() => {
      terminateProcessTree(child.pid);
      const partialOutput = Buffer.concat(stdout).toString("utf8");
      if (operation === "search" && partialOutput.trim()) {
        console.warn("[sources] external-call:partial", { durationMs: Date.now() - startedAt, operation, reason: "timeout" });
        complete(partialOutput);
        return;
      }
      fail(new Error(operation === "download" ? "SOURCE_PREPARATION_TIMEOUT" : "SOURCE_SEARCH_TIMEOUT"), { reason: "timeout" });
    }, timeoutMs);

    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_OUTPUT_BYTES) {
        terminateProcessTree(child.pid);
        fail(new Error("SOURCE_RESPONSE_TOO_LARGE"), { reason: "output-limit" });
        return;
      }
      target.push(chunk);
    };

    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", (cause) => {
      fail(new Error("SOURCE_TOOL_FAILED"), { executable: path.basename(executable), reason: cause.message });
    });
    child.once("close", (code) => {
      if (settled) return;
      const output = Buffer.concat(stdout).toString("utf8");
      if (code === 0) {
        complete(output);
        return;
      }
      if (operation === "search" && output.trim()) {
        console.warn("[sources] external-call:partial", { code, durationMs: Date.now() - startedAt, operation, reason: "non-zero-exit" });
        complete(output);
        return;
      }
      const detail = Buffer.concat(stderr).toString("utf8").trim().split(/\r?\n/).at(-1);
      fail(new Error("SOURCE_TOOL_FAILED"), { code, detail, executable: path.basename(executable) });
    });
  });
}

function terminateProcessTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { shell: false, windowsHide: true });
    killer.unref();
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process may have completed between the timeout and termination.
    }
  }
}
