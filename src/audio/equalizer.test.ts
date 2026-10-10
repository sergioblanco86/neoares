import { describe, expect, it, vi } from "vitest";
import { EqualizerGraph } from "./equalizer";
import { defaultEqualizerSettings } from "../shared/equalizer";

function fixture() {
  const param = () => ({ value: 0, cancelAndHoldAtTime: vi.fn(), setTargetAtTime: vi.fn() });
  const node = () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() });
  const context = { currentTime: 3, sampleRate: 48000, createGain: node,
    createBiquadFilter: () => ({ ...node(), type: "", frequency: param(), Q: param() }),
  };
  return new EqualizerGraph(context as unknown as BaseAudioContext, node() as unknown as AudioNode);
}

describe("independent equalizer bands", () => {
  it.each([0, 9])("band %i does not adjust broadband gain at any slider position", index => {
    const graph = fixture();
    for (const gain of [-12, -6, 0, 6, 12]) {
      graph.configure({ ...defaultEqualizerSettings(), enabled: true, gainsDb: Array.from({ length: 10 }, (_, band) => band === index ? gain : 0) }, true);
      expect(graph.input.gain.value).toBe(1);
      expect(graph.filters[index].gain.value).toBe(gain);
      expect(graph.filters.filter((_, band) => band !== index).every(filter => filter.gain.value === 0)).toBe(true);
    }
  });

  it("preamp changes volume independently and bypass restores unity/flat", () => {
    const graph = fixture();
    graph.configure({ ...defaultEqualizerSettings(), enabled: true, preampDb: -6, gainsDb: Array(10).fill(12) }, true);
    expect(graph.input.gain.value).toBeCloseTo(10 ** (-6 / 20));
    expect(graph.filters.every(filter => filter.gain.value === 12)).toBe(true);
    graph.configure({ ...defaultEqualizerSettings(), enabled: false, preampDb: 12, gainsDb: Array(10).fill(12) }, true);
    expect(graph.input.gain.value).toBe(1);
    expect(graph.filters.every(filter => filter.gain.value === 0)).toBe(true);
  });

  it("smooths real-time band edits without introducing gain compensation", () => {
    const graph = fixture();
    graph.configure({ ...defaultEqualizerSettings(), enabled: true, gainsDb: [12, 0, 0, 0, 0, 0, 0, 0, 0, -12] });
    expect(graph.input.gain.setTargetAtTime).toHaveBeenCalledWith(1, 3, 0.02);
    expect(graph.filters[0].gain.setTargetAtTime).toHaveBeenCalledWith(12, 3, 0.02);
    expect(graph.filters[9].gain.setTargetAtTime).toHaveBeenCalledWith(-12, 3, 0.02);
  });
});
