import { describe, expect, it, vi } from "vitest";
import { MusicSourceService, normalizeMusicSearchItem, selectByPopularity, type MusicSearchClient } from "./music-source-service";
import type { YouTubeSource } from "../src/shared/contracts";

describe("MusicSourceService", () => {
  it("groups song-only catalogue results by query", async () => {
    const searchSongs = vi.fn(async (query: string) => [song({
      id: query === "Agnostic Front" ? "kK7YZYTQbuA" : "MB8HyXAMSgA",
      title: query === "Agnostic Front" ? "Gotta Go" : "For My Family",
    })]);
    const client: MusicSearchClient = { searchSongs, getArtist: vi.fn(), getAlbum: vi.fn() };
    const service = new MusicSourceService(async () => client);

    const groups = await service.searchMany(["Agnostic Front", "Related Artist"], 6, 5);

    expect(groups.map((group) => group.map(({ title }) => title))).toEqual([["Gotta Go"], ["For My Family"]]);
    expect(groups[0]?.[0]).toMatchObject({
      catalog: "YOUTUBE_MUSIC",
      creator: "Agnostic Front",
      musicMetadata: { resultType: "SONG", album: "Something's Gotta Give" },
    });
  });

  it("drops non-song and malformed results", () => {
    expect(normalizeMusicSearchItem({ ...song(), item_type: "video" })).toBeNull();
    expect(normalizeMusicSearchItem({ ...song(), id: "invalid" })).toBeNull();
    expect(normalizeMusicSearchItem({ ...song(), artists: [] })).toBeNull();
  });

  it("uses album tracks for low popularity and excludes top songs", async () => {
    const searchSongs = vi.fn(async () => [song({ id: "POPULR00001", title: "The Hit" })]);
    const getArtist = vi.fn(async () => ({
      sections: [
        { contents: [song({ id: "POPULR00001", title: "The Hit" })] },
        { contents: [{ item_type: "album", id: "album-one", title: "Hidden Album", year: "2004" }] },
      ],
    }));
    const getAlbum = vi.fn(async () => ({
      contents: [
        song({ id: "POPULR00001", title: "The Hit" }),
        song({ id: "DEEPCT00001", title: "Album Track" }),
      ],
    }));
    const service = new MusicSourceService(async () => ({ searchSongs, getArtist, getAlbum }));

    const [sources] = await service.searchMany(["Agnostic Front 2004"], 4, 1);

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      id: "DEEPCT00001",
      musicMetadata: { album: "Hidden Album", discoveryPath: "ALBUM" },
    });
    expect(getArtist).toHaveBeenCalledWith("artist");
    expect(getAlbum).toHaveBeenCalledWith("album-one");
  });

  it("mixes hits and album tracks according to the selected level", () => {
    const popular = Array.from({ length: 6 }, (_, index) => source(`POPULAR0000${index}`, "SEARCH"));
    const deepCuts = Array.from({ length: 6 }, (_, index) => source(`DEEPCUT0000${index}`, "ALBUM"));

    expect(paths(selectByPopularity(popular, deepCuts, 1, 4, () => 0.999))).toEqual(["ALBUM", "ALBUM", "ALBUM", "ALBUM"]);
    expect(paths(selectByPopularity(popular, deepCuts, 3, 4, () => 0.999))).toEqual(["SEARCH", "SEARCH", "ALBUM", "ALBUM"]);
    expect(paths(selectByPopularity(popular, deepCuts, 5, 4, () => 0.999))).toEqual(["SEARCH", "SEARCH", "SEARCH", "SEARCH"]);
  });
});

function source(id: string, discoveryPath: "SEARCH" | "ALBUM"): YouTubeSource {
  return {
    id,
    canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
    title: id,
    creator: "Artist",
    durationSeconds: 180,
    thumbnailUrl: null,
    catalog: "YOUTUBE_MUSIC",
    musicMetadata: { resultType: "SONG", artists: ["Artist"], album: null, discoveryPath },
  };
}

function paths(sources: YouTubeSource[]): Array<"SEARCH" | "ALBUM" | undefined> {
  return sources.map(({ musicMetadata }) => musicMetadata?.discoveryPath);
}

function song(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    item_type: "song",
    id: "kK7YZYTQbuA",
    title: "Gotta Go",
    duration: { text: "3:35", seconds: 215 },
    artists: [{ name: "Agnostic Front", channel_id: "artist" }],
    album: { id: "album", name: "Something's Gotta Give" },
    thumbnail: { contents: [{ url: "https://example.com/60.jpg", width: 60 }, { url: "https://example.com/120.jpg", width: 120 }] },
    ...overrides,
  };
}
