import { describe, expect, it, vi } from "vitest";
import { AudioAnalyzer, bandRms } from "./audio-analyzer";
import { BeatDetector } from "./beat-detector";
import type { MixerAnalysisTap } from "../../audio/dual-deck-mixer";

describe("AudioAnalyzer", () => {
  it("reuses its frame and buffers, produces finite silence, decays on pause and disconnects only itself", () => {
    let level = 0;
    const node = { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData: (array: Float32Array) => array.fill(level), getFloatFrequencyData: (array: Float32Array) => array.fill(-Infinity), disconnect: vi.fn() };
    const context = { state: "running", sampleRate: 48000, createAnalyser: () => node, close: vi.fn() };
    const tap = { node: { connect: vi.fn(), disconnect: vi.fn() }, context } as unknown as MixerAnalysisTap;
    const analyzer = new AudioAnalyzer(tap), frame = analyzer.sample(100), waveform = frame.waveform, spectrum = frame.frequencySpectrum;
    expect([frame.volume, frame.bass, frame.mids, frame.highs, frame.beat]).toEqual([0, 0, 0, 0, 0]);
    level = 0.4; expect(analyzer.sample(200).volume).toBeCloseTo(0.4);
    context.state = "suspended";
    expect(analyzer.sample(380)).toBe(frame); expect(frame.waveform).toBe(waveform); expect(frame.frequencySpectrum).toBe(spectrum);
    expect(frame.volume).toBeCloseTo(0.4 / Math.E); expect(frame.frequencySpectrum.every(Number.isFinite)).toBe(true);
    analyzer.dispose(); analyzer.dispose();
    expect(tap.node.disconnect).toHaveBeenCalledExactlyOnceWith(node); expect(context.close).not.toHaveBeenCalled();
  });
});

describe("frequency bands", () => {
  it("uses real Hz with sample-rate-dependent bin spacing and RMS, not maximum", () => {
    const spectrum = new Float32Array(1024); spectrum[4] = 1;
    expect(bandRms(spectrum, 48000 / 2048, 20, 250)).toBeCloseTo(Math.sqrt(1 / 10));
    expect(bandRms(spectrum, 48000 / 2048, 250, 4000)).toBe(0);
    expect(bandRms(spectrum, 8000 / 2048, 4000, 16000)).toBe(0);
  });
});
describe("BeatDetector", () => {
  it("detects a real onset and uses elapsed time for its decay", () => {
    const first = new BeatDetector(), second = new BeatDetector();
    for (let time = 0; time < 700; time += 50) { first.update(0.04, time); second.update(0.04, time); }
    expect(first.update(0.4, 700)).toBe(1); second.update(0.4, 700);
    first.update(0, 790);
    expect(first.update(0, 880)).toBeCloseTo(second.update(0, 880));
    expect(second.update(0, 1060)).toBeLessThan(0.2); second.reset(); expect(second.update(0, 1100)).toBe(0);
  });
});
