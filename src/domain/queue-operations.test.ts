import { describe, expect, it } from "vitest";
import type { YouTubeSource } from "../shared/contracts";
import { getUpcoming, insertUpcoming, removeUpcomingTrack, reorderUpcoming, replaceUpcomingTrack, setUpcoming } from "./queue-operations";

const tracks = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  canonicalUrl: `https://www.youtube.com/watch?v=${id}`,
  title: id.toUpperCase(),
  creator: `Artist ${id}`,
  durationSeconds: 180,
  thumbnailUrl: null,
})) satisfies YouTubeSource[];

describe("queue operations", () => {
  it("moves any upcoming track to an arbitrary position", () => {
    expect(reorderUpcoming(tracks, 3, 0).map(({ id }) => id)).toEqual(["d", "a", "b", "c", "e"]);
    expect(reorderUpcoming(tracks, 0, 2).map(({ id }) => id)).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("inserts a requested track next or at the end without duplicates", () => {
    const requested = { ...tracks[0], id: "requested" };
    expect(insertUpcoming(tracks, requested, "NEXT")[0].id).toBe("requested");
    expect(insertUpcoming(tracks, requested, "END").at(-1)?.id).toBe("requested");
    expect(insertUpcoming(tracks, tracks[0], "END")).toBe(tracks);
  });

  it("replaces one track without changing the queue length", () => {
    const replacement = { ...tracks[0], id: "replacement" };
    const result = replaceUpcomingTrack(tracks, 2, replacement);
    expect(result).toHaveLength(tracks.length);
    expect(result[2].id).toBe("replacement");
  });

  it("only removes tracks when at least four will remain", () => {
    expect(removeUpcomingTrack(tracks, 2)).toHaveLength(4);
    expect(removeUpcomingTrack(tracks.slice(0, 4), 2)).toHaveLength(4);
  });

  it("keeps playback history and the current track when replacing upcoming tracks", () => {
    expect(setUpcoming(tracks, 1, [tracks[4]]).map(({ id }) => id)).toEqual(["a", "b", "e"]);
  });

  it("never reports played tracks or the current track as upcoming", () => {
    expect(getUpcoming(tracks, 2).map(({ id }) => id)).toEqual(["d", "e"]);
    expect(getUpcoming(tracks, tracks.length - 1)).toEqual([]);
  });
});
