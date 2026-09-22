import { describe, expect, it } from "vitest";
import { calculateCrossfadeDelay, createTransitionPlan, summarizeWaveform } from "./dual-deck-mixer";

describe("createTransitionPlan", () => {
  it("preserves original speed even when tempos are close", () => {
    expect(createTransitionPlan(124, 120, 8)).toEqual({
      mode: "CROSSFADE",
      playbackRate: 1,
      durationSeconds: 8,
    });
  });

  it("preserves original speed when tempos are far apart", () => {
    expect(createTransitionPlan(133, 110, 8)).toEqual({
      mode: "CROSSFADE",
      playbackRate: 1,
      durationSeconds: 8,
    });
  });

  it("keeps a positive fade duration", () => {
    expect(createTransitionPlan(90, 130, 0).durationSeconds).toBe(0.25);
  });
});

describe("calculateCrossfadeDelay", () => {
  it("starts the fade before the outgoing song reaches its end", () => {
    expect(calculateCrossfadeDelay(240, 100, 6, 0.5)).toBe(133.5);
  });

  it("uses an immediate fallback when the fade window was already missed", () => {
    expect(calculateCrossfadeDelay(240, 239.9, 6, 0.5)).toBe(0.1);
  });

  it("accounts for the safety margin in short tracks", () => {
    expect(calculateCrossfadeDelay(10, 0, 6, 0.5)).toBe(3.5);
  });
});

describe("summarizeWaveform", () => {
  it("preserves the relative loudness of the decoded audio", () => {
    const samples = new Float32Array([
      0.1, -0.1, 0.1, -0.1,
      0.8, -0.8, 0.8, -0.8,
    ]);

    const waveform = summarizeWaveform(samples, 2);

    expect(waveform).toHaveLength(2);
    expect(waveform[0]).toBeCloseTo(0.125);
    expect(waveform[1]).toBe(1);
  });
});
