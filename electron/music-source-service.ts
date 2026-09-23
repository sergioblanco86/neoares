import { Innertube, UniversalCache } from "youtubei.js";
import type { SourceRequestScope, YouTubeSource } from "../src/shared/contracts";

const MUSIC_SEARCH_TIMEOUT_MS = 10_000;
const MUSIC_SEARCH_CONCURRENCY = 3;

export type MusicSearchClient = {
  searchSongs(query: string): Promise<unknown[]>;
};

type MusicSearchOutcome = {
  sources: YouTubeSource[];
  failed: boolean;
};

export class MusicSourceService {
  #clientPromise: Promise<MusicSearchClient> | null = null;

  constructor(private readonly clientFactory: () => Promise<MusicSearchClient> = createInnertubeClient) {}

  async searchMany(
    queryInputs: string[],
    requestedLimit: number,
    _scope: SourceRequestScope = "playback",
  ): Promise<YouTubeSource[][]> {
    const queries = [...new Set(queryInputs.map((query) => query.trim().slice(0, 160)).filter(Boolean))].slice(0, 8);
    const limit = Math.min(10, Math.max(1, Math.trunc(requestedLimit)));
    if (queries.length === 0) throw new Error("MUSIC_SEARCH_EMPTY");

    const client = await this.#client();
    const outcomes = await mapWithConcurrency(queries, MUSIC_SEARCH_CONCURRENCY, async (query): Promise<MusicSearchOutcome> => {
      const startedAt = Date.now();
      try {
        const items = await withTimeout(client.searchSongs(query), MUSIC_SEARCH_TIMEOUT_MS, "MUSIC_SEARCH_TIMEOUT");
        const sources = items
          .map(normalizeMusicSearchItem)
          .filter((source): source is YouTubeSource => source !== null)
          .slice(0, limit);
        console.info("[music-sources] search:complete", { durationMs: Date.now() - startedAt, resultCount: sources.length });
        return { sources, failed: false };
      } catch (cause) {
        console.warn("[music-sources] search:failed", {
          durationMs: Date.now() - startedAt,
          message: cause instanceof Error ? cause.message : "UNKNOWN",
        });
        return { sources: [], failed: true };
      }
    });

    if (outcomes.every(({ failed }) => failed)) throw new Error("MUSIC_SEARCH_UNAVAILABLE");
    return outcomes.map(({ sources }) => sources);
  }

  async #client(): Promise<MusicSearchClient> {
    this.#clientPromise ??= this.clientFactory().catch((cause) => {
      this.#clientPromise = null;
      throw cause;
    });
    return this.#clientPromise;
  }
}

export function normalizeMusicSearchItem(value: unknown): YouTubeSource | null {
  if (!isRecord(value) || value.item_type !== "song") return null;
  const id = typeof value.id === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.id) ? value.id : null;
  const title = typeof value.title === "string" ? value.title.trim() : "";
  const durationSeconds = readDurationSeconds(value.duration);
  const artists = readArtists(value.artists);
  if (!id || !title || durationSeconds <= 0 || artists.length === 0) return null;

  return {
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    title,
    creator: artists.join(", "),
    durationSeconds,
    thumbnailUrl: readThumbnail(value.thumbnail),
    catalog: "YOUTUBE_MUSIC",
    musicMetadata: {
      resultType: "SONG",
      artists,
      album: readAlbum(value.album),
    },
  };
}

async function createInnertubeClient(): Promise<MusicSearchClient> {
  const innertube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
  });
  return {
    async searchSongs(query: string): Promise<unknown[]> {
      const result = await innertube.music.search(query, { type: "song" });
      return result.songs?.contents ?? [];
    },
  };
}

function readDurationSeconds(value: unknown): number {
  if (!isRecord(value) || typeof value.seconds !== "number" || !Number.isFinite(value.seconds)) return 0;
  return Math.max(0, value.seconds);
}

function readArtists(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((artist) => {
    if (!isRecord(artist) || typeof artist.name !== "string" || !artist.name.trim()) return [];
    return [artist.name.trim()];
  }))];
}

function readAlbum(value: unknown): string | null {
  return isRecord(value) && typeof value.name === "string" && value.name.trim() ? value.name.trim() : null;
}

function readThumbnail(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.contents)) return null;
  const candidates = value.contents.flatMap((thumbnail) => {
    if (!isRecord(thumbnail) || typeof thumbnail.url !== "string") return [];
    return [{ url: thumbnail.url, width: typeof thumbnail.width === "number" ? thumbnail.width : 0 }];
  });
  return candidates.sort((left, right) => right.width - left.width)[0]?.url ?? null;
}

async function mapWithConcurrency<T, R>(values: T[], concurrency: number, task: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(values[index]);
    }
  }));
  return results;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(code)), timeoutMs);
    timer.unref?.();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
