import { describe, expect, it, vi } from "vitest";
import { MusicSourceService, normalizeMusicSearchItem, type MusicSearchClient } from "./music-source-service";

describe("MusicSourceService", () => {
  it("groups song-only catalogue results by query", async () => {
    const searchSongs = vi.fn(async (query: string) => [song({
      id: query === "Agnostic Front" ? "kK7YZYTQbuA" : "MB8HyXAMSgA",
      title: query === "Agnostic Front" ? "Gotta Go" : "For My Family",
    })]);
    const client: MusicSearchClient = { searchSongs };
    const service = new MusicSourceService(async () => client);

    const groups = await service.searchMany(["Agnostic Front", "Related Artist"], 6);

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
});

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
