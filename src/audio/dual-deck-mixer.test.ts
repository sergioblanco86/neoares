import { describe, expect, it } from "vitest";
import { analyzeLoudnessSamples, calculateCrossfadeDelay, createTransitionPlan, summarizeWaveform } from "./dual-deck-mixer";

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

describe("analyzeLoudnessSamples", () => {
  it("recommends more gain for a quieter recording", () => {
    const sampleRate = 1_000;
    const quiet = Float32Array.from({ length: sampleRate }, (_, index) => 0.05 * Math.sin(index));
    const loud = Float32Array.from({ length: sampleRate }, (_, index) => 0.3 * Math.sin(index));

    const quietAnalysis = analyzeLoudnessSamples([quiet], sampleRate);
    const loudAnalysis = analyzeLoudnessSamples([loud], sampleRate);

    expect(quietAnalysis.integratedLufs).toBeLessThan(loudAnalysis.integratedLufs);
    expect(quietAnalysis.recommendedGainDb).toBeGreaterThan(loudAnalysis.recommendedGainDb);
    expect(quietAnalysis.targetLufs).toBe(-14);
  });

  it("normalizes perceived loudness while reporting peaks to the safety limiter", () => {
    const samples = new Float32Array(1_000).fill(0.01);
    samples[500] = 0.95;

    const analysis = analyzeLoudnessSamples([samples], 1_000);

    expect(analysis.samplePeakDbfs).toBeGreaterThan(-1);
    expect(analysis.recommendedGainDb).toBeGreaterThan(0);
    expect(analysis.ceilingDbfs).toBe(-1);
  });

  it("returns finite conservative values for silence", () => {
    const analysis = analyzeLoudnessSamples([new Float32Array(1_000)], 1_000);
    expect(analysis).toMatchObject({ integratedLufs: -70, samplePeakDbfs: -120, recommendedGainDb: 8 });
  });
});
