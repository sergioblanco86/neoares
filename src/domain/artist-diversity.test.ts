import { describe, expect, it } from "vitest";
import type { YouTubeSource } from "../shared/contracts";
import {
  ARTIST_DIVERSITY_WINDOW_SIZE,
  canAppendAutonomousTrack,
  canReplaceWithAutonomousTrack,
  primaryArtistKey,
  pruneUpcomingArtistDuplicates,
} from "./artist-diversity";

describe("artist diversity", () => {
  it("rejects a third appearance of the same artist in a short queue", () => {
    const queue = [
      track("a1", "Rancid"),
      track("b1", "NOFX"),
      track("a2", "Rancid"),
      track("c1", "Pennywise"),
      track("d1", "Bad Religion"),
    ];

    expect(canAppendAutonomousTrack(queue, track("a3", "Rancid"))).toBe(false);
  });

  it("allows the artist to return once earlier appearances leave the ten-track window", () => {
    const queue = [track("a1", "Rancid"), track("a2", "Rancid")];
    for (let index = 0; index < ARTIST_DIVERSITY_WINDOW_SIZE - 1; index += 1) {
      queue.push(track(`other-${index}`, `Artist ${index}`));
    }

    expect(canAppendAutonomousTrack(queue, track("a3", "Rancid"))).toBe(true);
  });

  it("checks both sides when replacing an existing queue position", () => {
    const queue = [
      track("a1", "Rancid"),
      track("b1", "NOFX"),
      track("c1", "Pennywise"),
      track("d1", "Bad Religion"),
      track("a2", "Rancid"),
    ];

    expect(canReplaceWithAutonomousTrack(queue, 2, track("a3", "Rancid"))).toBe(false);
    expect(canReplaceWithAutonomousTrack(queue, 2, track("e1", "Lagwagon"))).toBe(true);
  });

  it("uses catalog artist metadata before uploader names", () => {
    const source = {
      ...track("music", "Label Channel"),
      musicMetadata: {
        resultType: "SONG" as const,
        artists: ["Héctor Lavoe"],
        album: "La Voz",
      },
    };

    expect(primaryArtistKey(source)).toBe("hector lavoe");
  });

  it("treats an explicit user request as an intentional override", () => {
    const queue = [track("a1", "Rancid"), track("a2", "Rancid")];
    expect(canAppendAutonomousTrack(queue, { ...track("a3", "Rancid"), requestedByUser: true })).toBe(true);
  });

  it("prunes old automatic duplicates only from the upcoming part of a restored queue", () => {
    const queue = [
      track("played", "Rancid"),
      track("current", "Rancid"),
      track("next", "NOFX"),
      track("duplicate", "Rancid"),
      track("later", "Pennywise"),
    ];

    expect(pruneUpcomingArtistDuplicates(queue, 1).map(({ id }) => id)).toEqual([
      "played",
      "current",
      "next",
      "later",
    ]);
  });
});

function track(id: string, artist: string): YouTubeSource {
  return {
    id,
    canonicalUrl: `https://example.invalid/${id}`,
    title: `${artist} - Song ${id}`,
    creator: `${artist} - Topic`,
    durationSeconds: 180,
    thumbnailUrl: null,
  };
}
