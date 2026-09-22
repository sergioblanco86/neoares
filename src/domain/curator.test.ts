import { describe, expect, it } from "vitest";
import { rankCandidates, type CandidateFeatures } from "./curator";

const weights = {
  occasion: 0.2,
  taste: 0.15,
  source: 0.05,
  bpm: 0.15,
  key: 0.08,
  energy: 0.17,
  phrase: 0.1,
  novelty: 0.1,
};

function candidate(overrides: Partial<CandidateFeatures> = {}): CandidateFeatures {
  return {
    trackId: "track-a",
    artistKey: "artist-a",
    durationSeconds: 240,
    blocked: false,
    available: true,
    occasion: 0.8,
    taste: 0.8,
    source: 0.8,
    bpm: 0.8,
    key: 0.8,
    energy: 0.8,
    phrase: 0.8,
    novelty: 0.8,
    uncertaintyPenalty: 0,
    preparationPenalty: 0,
    ...overrides,
  };
}

describe("curator", () => {
  it("filters blocked, repeated and unavailable candidates", () => {
    const result = rankCandidates(
      [
        candidate({ trackId: "blocked", blocked: true }),
        candidate({ trackId: "recent" }),
        candidate({ trackId: "offline", available: false }),
        candidate({ trackId: "winner" }),
      ],
      {
        weights,
        recentTrackIds: new Set(["recent"]),
        recentArtistKeys: new Set(),
        minDurationSeconds: 120,
        maxDurationSeconds: 600,
        randomSeed: 42,
      },
    );

    expect(result.map(({ trackId }) => trackId)).toEqual(["winner"]);
  });

  it("ranks stronger musical fit first", () => {
    const result = rankCandidates(
      [candidate({ trackId: "weak", bpm: 0.1, energy: 0.2 }), candidate({ trackId: "strong", bpm: 1, energy: 1 })],
      {
        weights,
        recentTrackIds: new Set(),
        recentArtistKeys: new Set(),
        minDurationSeconds: 120,
        maxDurationSeconds: 600,
        randomSeed: 7,
      },
    );

    expect(result[0]?.trackId).toBe("strong");
    expect(result[0]?.totalScore).toBeGreaterThan(result[1]?.totalScore ?? 1);
  });

  it("rejects an all-zero weight policy", () => {
    expect(() =>
      rankCandidates([candidate()], {
        weights: Object.fromEntries(Object.keys(weights).map((name) => [name, 0])) as typeof weights,
        recentTrackIds: new Set(),
        recentArtistKeys: new Set(),
        minDurationSeconds: 120,
        maxDurationSeconds: 600,
        randomSeed: 1,
      }),
    ).toThrow("CURATION_WEIGHTS_INVALID");
  });
});
