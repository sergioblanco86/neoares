import { afterEach, describe, expect, it, vi } from "vitest";
import { DualDeckMixer, type PreparedDeckAudio } from "./dual-deck-mixer";
import { defaultEqualizerSettings } from "../shared/equalizer";
import { selectEqualizerPreset } from "../equalizer/personal-presets";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
function fixture() {
  const param = () => ({ value: 0, cancelScheduledValues: vi.fn(), cancelAndHoldAtTime: vi.fn(), setTargetAtTime: vi.fn(), setValueCurveAtTime: vi.fn() });
  const nodes: any[] = [], sources: any[] = [];
  const node = () => { const result = { gain: param(), connect: vi.fn((destination: unknown) => destination), disconnect: vi.fn() }; nodes.push(result); return result; };
  const context = { currentTime: 0, sampleRate: 48000, state: "running", destination: {}, resume: vi.fn(async () => {}), suspend: vi.fn(async () => {}), close: vi.fn(async () => {}),
    createGain: node, createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createBiquadFilter: () => ({ ...node(), frequency: param(), Q: param(), getFrequencyResponse: (_frequencies: unknown, magnitudes: Float32Array) => magnitudes.fill(1) }),
    createBufferSource: () => { const result = { ...node(), buffer: null, playbackRate: param(), start: vi.fn(), stop: vi.fn(), addEventListener: vi.fn() }; sources.push(result); return result; },
    decodeAudioData: vi.fn(async () => ({ duration: 120, sampleRate: 1000, numberOfChannels: 1, getChannelData: () => new Float32Array(1000) })),
  };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } }); vi.stubGlobal("window", globalThis);
  const mixer = new DualDeckMixer();
  return { mixer, context, nodes, sources };
}

describe("prepared mixer and equalizer integration", () => {
  it("decodes/analyzes once off-deck and installs prepared buffers without decoding or starting audio", async () => {
    const { mixer, context } = fixture(); const audio = await mixer.prepare(new Uint8Array(32));
    expect(mixer.getPlayerSnapshot("A").durationSeconds).toBe(0);
    mixer.loadPrepared("A", audio); mixer.loadPrepared("B", audio);
    expect(context.decodeAudioData).toHaveBeenCalledOnce(); expect(context.resume).not.toHaveBeenCalled();
    expect(mixer.getPlayerSnapshot("A").durationSeconds).toBe(120);
    await mixer.dispose();
  });
  it("rejects stale asynchronous loads when a prepared buffer supersedes them", async () => {
    const { mixer, context } = fixture(); let resolve!: (value: unknown) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }) as any);
    const loading = mixer.load("A", new Uint8Array(32));
    mixer.unload("A"); resolve({ duration: 120, sampleRate: 1000, numberOfChannels: 1, getChannelData: () => new Float32Array(1000) });
    await expect(loading).rejects.toThrow("DECK_LOAD_SUPERSEDED"); await mixer.dispose();
  });
  it("rapid skips cancel old fade timers before a deck is reused", async () => {
    vi.useFakeTimers(); const { mixer, sources } = fixture();
    const prepared = await mixer.prepare(new Uint8Array(32));
    mixer.loadPrepared("A", prepared); await mixer.play("A");
    mixer.loadPrepared("B", prepared); await mixer.crossfade("A", "B", 6);
    mixer.finishTransition(); mixer.loadPrepared("A", prepared); await mixer.crossfade("B", "A", 6);
    await vi.advanceTimersByTimeAsync(6100);
    expect(sources[2].stop).not.toHaveBeenCalled(); expect(sources[1].stop).toHaveBeenCalled();
    expect(mixer.getPlayerSnapshot("A").playing).toBe(true); await mixer.dispose();
  });
  it("equalization before context creation is retained, and updates never resume/reset the transport", async () => {
    const { mixer, context } = fixture(); mixer.setEqualizer(selectEqualizerPreset(defaultEqualizerSettings(), "rock"));
    expect(context.resume).not.toHaveBeenCalled(); const audio = await mixer.prepare(new Uint8Array(32));
    mixer.loadPrepared("A", audio); await mixer.play("A"); context.resume.mockClear();
    const before = mixer.getPlayerSnapshot("A"); mixer.setEqualizer(selectEqualizerPreset(defaultEqualizerSettings(), "bass"));
    expect(mixer.getPlayerSnapshot("A")).toEqual(before); expect(context.resume).not.toHaveBeenCalled();
    mixer.setEqualizer(defaultEqualizerSettings()); expect(context.resume).not.toHaveBeenCalled();
    await mixer.dispose();
  });
});
