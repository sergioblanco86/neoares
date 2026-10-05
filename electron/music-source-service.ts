import { Innertube, UniversalCache } from "youtubei.js";
import type { PopularityLevel, SourceRequestScope, YouTubeSource } from "../src/shared/contracts";

const MUSIC_SEARCH_TIMEOUT_MS = 12_000;
const MUSIC_SEARCH_CONCURRENCY = 3;
const CATALOG_CACHE_LIMIT = 100;

export type MusicSearchClient = {
  searchSongs(query: string): Promise<unknown[]>;
  getArtist(artistId: string): Promise<unknown>;
  getAlbum(albumId: string): Promise<unknown>;
};

type MusicSearchOutcome = { sources: YouTubeSource[]; failed: boolean };
type ArtistReference = { id: string; name: string };
type AlbumReference = { id: string; title: string; year: number | null };
type AlbumContext = { album: string; artist: string; thumbnailUrl: string | null };

export class MusicSourceService {
  #clientPromise: Promise<MusicSearchClient> | null = null;
  readonly #artistCache = new Map<string, Promise<unknown>>();
  readonly #albumCache = new Map<string, Promise<unknown>>();

  constructor(private readonly clientFactory: () => Promise<MusicSearchClient> = createInnertubeClient) {}

  async searchMany(
    queryInputs: string[],
    requestedLimit: number,
    popularityLevel: PopularityLevel = 3,
    _scope: SourceRequestScope = "playback",
  ): Promise<YouTubeSource[][]> {
    const queries = [...new Set(queryInputs.map((query) => query.trim().slice(0, 160)).filter(Boolean))].slice(0, 8);
    const limit = Math.min(10, Math.max(1, Math.trunc(requestedLimit)));
    const popularity = normalizePopularityLevel(popularityLevel);
    if (queries.length === 0) throw new Error("MUSIC_SEARCH_EMPTY");

    const client = await this.#client();
    const outcomes = await mapWithConcurrency(queries, MUSIC_SEARCH_CONCURRENCY, async (query): Promise<MusicSearchOutcome> => {
      const startedAt = Date.now();
      try {
        const sources = await withTimeout(
          this.#discoverForQuery(client, query, limit, popularity),
          MUSIC_SEARCH_TIMEOUT_MS,
          "MUSIC_SEARCH_TIMEOUT",
        );
        console.info("[music-sources] search:complete", { durationMs: Date.now() - startedAt, popularity, resultCount: sources.length });
        return { sources, failed: false };
      } catch (cause) {
        console.warn("[music-sources] search:failed", {
          durationMs: Date.now() - startedAt,
          message: cause instanceof Error ? cause.message : "UNKNOWN",
          popularity,
        });
        return { sources: [], failed: true };
      }
    });

    if (outcomes.every(({ failed }) => failed)) throw new Error("MUSIC_SEARCH_UNAVAILABLE");
    return outcomes.map(({ sources }) => sources);
  }

  async #discoverForQuery(client: MusicSearchClient, query: string, limit: number, popularity: PopularityLevel): Promise<YouTubeSource[]> {
    const items = await client.searchSongs(query);
    const popular = items
      .map((item, index) => normalizeMusicSearchItem(item, index, items.length))
      .filter((source): source is YouTubeSource => source !== null);
    if (popularity === 5) return selectByPopularity(popular, [], popularity, limit);

    const artist = readPrimaryArtist(items);
    const deepCuts = artist
      ? await this.#loadAlbumTracks(client, artist, query, new Set(popular.slice(0, 10).map(({ id }) => id)), limit * 2, popularity)
      : [];
    return selectByPopularity(popular, deepCuts, popularity, limit);
  }

  async #loadAlbumTracks(
    client: MusicSearchClient,
    artist: ArtistReference,
    query: string,
    topSongIds: Set<string>,
    requestedLimit: number,
    popularity: PopularityLevel,
  ): Promise<YouTubeSource[]> {
    const artistPage = await this.#cached(this.#artistCache, artist.id, () => client.getArtist(artist.id));
    for (const id of readArtistTopSongIds(artistPage)) topSongIds.add(id);
    const albumCount = popularity <= 2 ? 2 : 1;
    const albums = selectAlbums(readArtistAlbums(artistPage), extractTargetYear(query), albumCount);
    if (albums.length === 0) return [];
    const pages = await Promise.all(albums.map((album) => this.#cached(this.#albumCache, album.id, () => client.getAlbum(album.id))
      .then((page) => ({ album, page }))));
    const tracks = pages.flatMap(({ album, page }) => normalizeAlbumTracks(page, {
      album: album.title,
      artist: artist.name,
      thumbnailUrl: readAlbumThumbnail(page),
    }, topSongIds));
    return shuffled(uniqueSources(tracks)).slice(0, requestedLimit);
  }

  async #cached(cache: Map<string, Promise<unknown>>, key: string, load: () => Promise<unknown>): Promise<unknown> {
    const cached = cache.get(key);
    if (cached) return cached;
    if (cache.size >= CATALOG_CACHE_LIMIT) cache.clear();
    const pending = load().catch((cause) => {
      cache.delete(key);
      throw cause;
    });
    cache.set(key, pending);
    return pending;
  }

  async #client(): Promise<MusicSearchClient> {
    this.#clientPromise ??= this.clientFactory().catch((cause) => {
      this.#clientPromise = null;
      throw cause;
    });
    return this.#clientPromise;
  }
}

export function normalizeMusicSearchItem(value: unknown, index = 0, total = 1): YouTubeSource | null {
  if (!isRecord(value) || value.item_type !== "song") return null;
  return createMusicSource(value, {
    album: readAlbum(value.album),
    artists: readArtists(value.artists),
    discoveryPath: "SEARCH",
    popularityScore: rankedPopularity(index, total),
    thumbnailUrl: readThumbnail(value.thumbnail),
  });
}

export function selectByPopularity(
  popular: YouTubeSource[],
  deepCuts: YouTubeSource[],
  level: PopularityLevel,
  limit: number,
  random: () => number = Math.random,
): YouTubeSource[] {
  const safeLimit = Math.max(1, Math.trunc(limit));
  const shuffledPopular = shuffled(popular.slice(0, level === 5 ? 10 : 14), random);
  const shuffledDeep = shuffled(deepCuts, random);
  if (level === 5) return shuffledPopular.slice(0, safeLimit);
  if (level === 4) return combineSources(shuffledPopular, shuffledDeep, Math.max(1, Math.ceil(safeLimit * 0.8)), safeLimit);
  if (level === 3) return combineSources(shuffledPopular, shuffledDeep, Math.ceil(safeLimit * 0.5), safeLimit);
  if (level === 2) return combineSources(shuffledPopular, shuffledDeep, Math.max(1, Math.floor(safeLimit * 0.25)), safeLimit);
  const fallbackDeep = shuffledDeep.length > 0 ? shuffledDeep : shuffled(popular.slice(Math.floor(popular.length / 2)), random);
  return fallbackDeep.slice(0, safeLimit);
}

async function createInnertubeClient(): Promise<MusicSearchClient> {
  const innertube = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true });
  return {
    async searchSongs(query: string): Promise<unknown[]> {
      const result = await innertube.music.search(query, { type: "song" });
      return result.songs?.contents ?? [];
    },
    getArtist: (artistId: string) => innertube.music.getArtist(artistId),
    getAlbum: (albumId: string) => innertube.music.getAlbum(albumId),
  };
}

function normalizeAlbumTracks(page: unknown, context: AlbumContext, topSongIds: Set<string>): YouTubeSource[] {
  if (!isRecord(page) || !Array.isArray(page.contents)) return [];
  const eligible = page.contents.filter((track) => {
    if (!isRecord(track) || (track.item_type !== "song" && track.item_type !== "video")) return false;
    const title = readText(track.title).toLowerCase();
    return !/^(intro|outro|interlude|skit|introduction|spoken word)$/.test(title);
  });
  return eligible.flatMap((track, index) => {
    if (!isRecord(track) || typeof track.id !== "string" || topSongIds.has(track.id)) return [];
    const source = createMusicSource(track, {
      album: context.album,
      artists: [context.artist],
      discoveryPath: "ALBUM",
      popularityScore: Math.min(0.45, 0.12 + (index / Math.max(1, eligible.length - 1)) * 0.28),
      thumbnailUrl: readThumbnail(track.thumbnail) ?? context.thumbnailUrl,
    });
    return source ? [source] : [];
  });
}

function createMusicSource(value: Record<string, unknown>, metadata: {
  album: string | null;
  artists: string[];
  discoveryPath: "SEARCH" | "ALBUM";
  popularityScore: number;
  thumbnailUrl: string | null;
}): YouTubeSource | null {
  const id = typeof value.id === "string" && /^[A-Za-z0-9_-]{11}$/.test(value.id) ? value.id : null;
  const title = readText(value.title).trim();
  const durationSeconds = readDurationSeconds(value.duration);
  if (!id || !title || durationSeconds <= 0 || metadata.artists.length === 0) return null;
  return {
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`,
    title,
    creator: metadata.artists.join(", "),
    durationSeconds,
    thumbnailUrl: metadata.thumbnailUrl,
    catalog: "YOUTUBE_MUSIC",
    musicMetadata: {
      resultType: "SONG",
      artists: metadata.artists,
      album: metadata.album,
      popularityScore: metadata.popularityScore,
      discoveryPath: metadata.discoveryPath,
    },
  };
}

function readPrimaryArtist(items: unknown[]): ArtistReference | null {
  for (const item of items) {
    if (!isRecord(item) || !Array.isArray(item.artists)) continue;
    for (const artist of item.artists) {
      if (!isRecord(artist) || typeof artist.channel_id !== "string" || typeof artist.name !== "string") continue;
      if (artist.channel_id && artist.name.trim()) return { id: artist.channel_id, name: artist.name.trim() };
    }
  }
  return null;
}

function readArtistAlbums(page: unknown): AlbumReference[] {
  if (!isRecord(page) || !Array.isArray(page.sections)) return [];
  return page.sections.flatMap((section) => {
    if (!isRecord(section) || !Array.isArray(section.contents)) return [];
    return section.contents.flatMap((item) => {
      if (!isRecord(item) || item.item_type !== "album" || typeof item.id !== "string") return [];
      const title = readText(item.title).trim();
      if (!title) return [];
      const parsedYear = typeof item.year === "string" ? Number(item.year) : item.year;
      return [{ id: item.id, title, year: typeof parsedYear === "number" && Number.isInteger(parsedYear) ? parsedYear : null }];
    });
  });
}

function readArtistTopSongIds(page: unknown): string[] {
  if (!isRecord(page) || !Array.isArray(page.sections)) return [];
  const firstSongSection = page.sections.find((section) => isRecord(section)
    && Array.isArray(section.contents)
    && section.contents.some((item) => isRecord(item) && item.item_type === "song"));
  if (!isRecord(firstSongSection) || !Array.isArray(firstSongSection.contents)) return [];
  return firstSongSection.contents.flatMap((item) => isRecord(item)
    && item.item_type === "song"
    && typeof item.id === "string"
    ? [item.id]
    : []);
}

function selectAlbums(albums: AlbumReference[], targetYear: number | null, limit: number): AlbumReference[] {
  if (targetYear === null) return shuffled(albums).slice(0, limit);
  const closest = [...albums].sort((left, right) => {
    const leftDistance = left.year === null ? Number.MAX_SAFE_INTEGER : Math.abs(left.year - targetYear);
    const rightDistance = right.year === null ? Number.MAX_SAFE_INTEGER : Math.abs(right.year - targetYear);
    return leftDistance - rightDistance;
  });
  return shuffled(closest.slice(0, Math.max(limit, 4))).slice(0, limit);
}

function combineSources(popular: YouTubeSource[], deepCuts: YouTubeSource[], popularCount: number, limit: number): YouTubeSource[] {
  const selectedPopular = popular.slice(0, popularCount);
  const selectedDeep = deepCuts.slice(0, Math.max(0, limit - selectedPopular.length));
  const remaining = [...popular.slice(selectedPopular.length), ...deepCuts.slice(selectedDeep.length)];
  return uniqueSources([...selectedPopular, ...selectedDeep, ...remaining]).slice(0, limit);
}

function uniqueSources(sources: YouTubeSource[]): YouTubeSource[] {
  const seen = new Set<string>();
  return sources.filter(({ id }) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function rankedPopularity(index: number, total: number): number {
  if (total <= 1) return 1;
  return Math.max(0.5, 1 - (index / (total - 1)) * 0.5);
}

function extractTargetYear(query: string): number | null {
  const matches = [...query.matchAll(/\b(19\d{2}|20\d{2}|2100)\b/g)];
  return matches.length ? Number(matches.at(-1)?.[1]) : null;
}

function normalizePopularityLevel(value: number): PopularityLevel {
  return Math.min(5, Math.max(1, Math.round(value))) as PopularityLevel;
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

function readAlbumThumbnail(page: unknown): string | null {
  return isRecord(page) && isRecord(page.header) ? readThumbnail(page.header.thumbnail) : null;
}

function readThumbnail(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.contents)) return null;
  const candidates = value.contents.flatMap((thumbnail) => {
    if (!isRecord(thumbnail) || typeof thumbnail.url !== "string") return [];
    return [{ url: thumbnail.url, width: typeof thumbnail.width === "number" ? thumbnail.width : 0 }];
  });
  return candidates.sort((left, right) => right.width - left.width)[0]?.url ?? null;
}

function readText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isRecord(value) && typeof value.text === "string") return value.text;
  if (value && typeof value === "object" && "toString" in value && typeof value.toString === "function") {
    const text = value.toString();
    return text === "[object Object]" ? "" : text;
  }
  return "";
}

function shuffled<T>(values: T[], random: () => number = Math.random): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
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
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (cause) => {
      clearTimeout(timer);
      reject(cause);
    });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
