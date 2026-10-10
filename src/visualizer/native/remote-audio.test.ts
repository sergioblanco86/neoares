import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteAudioSource } from "./remote-audio";
import { isNativeVisualizerState } from "../../shared/native-visualizer";

afterEach(() => vi.unstubAllGlobals());
function setup() {
  const context = { state: "suspended", suspend: vi.fn(async () => {}), close: vi.fn(async () => {}) };
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
  const peer = { start: vi.fn(), close: vi.fn(), postMessage: vi.fn(), onmessage: null as ((event: { data: unknown }) => void) | null };
  const source = new RemoteAudioSource(peer as unknown as MessagePort, "generation", 44100);
  source.playing = true;
  const packet = (change = {}) => ({ type: "pcm", generation: "generation", sequence: 1, sampleRate: 44100, producedAt: Date.now(), buffer: new Uint8Array(3072).fill(190).buffer, ...change });
  return { source, peer, context, packet, send: (data: unknown) => peer.onmessage!({ data }) };
}
describe("native PCM receiver", () => {
  it("copies stereo samples, returns owned buffer, suspends metadata context and disposes once", async () => {
    const { source, peer, packet, send, context } = setup();
    await source.ready; expect(context.suspend).toHaveBeenCalledOnce();
    send(packet()); expect(source.sample().timeByteArray[0]).toBe(190);
    expect(source.sample().timeByteArrayL[0]).toBe(190); expect(source.sample().timeByteArrayR[0]).toBe(190);
    expect(peer.postMessage).toHaveBeenCalledOnce();
    source.dispose(); source.dispose(); expect(peer.close).toHaveBeenCalledOnce(); expect(context.close).toHaveBeenCalledOnce();
  });
  it("rejects foreign generations/invalid sizes and recycles stale/wrong-rate packets without consuming them", () => {
    const { source, peer, packet, send } = setup();
    send(packet({ generation: "old" })); send(packet({ buffer: new ArrayBuffer(2) }));
    expect(peer.postMessage).not.toHaveBeenCalled();
    send(packet({ sampleRate: 48000 })); send(packet({ producedAt: Date.now() - 200 }));
    expect(peer.postMessage).toHaveBeenCalledTimes(2); expect(source.sample().timeByteArray[0]).toBe(128);
    send(packet()); send(packet({ buffer: new Uint8Array(3072).fill(220).buffer }));
    expect(source.sample().timeByteArray[0]).toBe(190); source.dispose();
  });
  it("uses silence after pause or missing fresh PCM", () => {
    const { source, packet, send } = setup();
    let now = 1000; vi.spyOn(performance, "now").mockImplementation(() => now);
    send(packet()); expect(source.sample().timeByteArray[0]).toBe(190);
    now += 101; expect(source.sample().timeByteArray[0]).toBe(128);
    send(packet({ sequence: 2 })); source.playing = false; expect(source.sample().timeByteArray[0]).toBe(128);
    source.dispose(); vi.restoreAllMocks();
  });
});
describe("native state validation", () => {
  const valid = { track: null, playing: false, positionSeconds: 0, durationSeconds: 0, sampleRate: 44100, locale: "es" };
  it("rejects malformed state without accepting invalid rates/times", () => {
    expect(isNativeVisualizerState(valid)).toBe(true);
    for (const invalid of [null, {}, { ...valid, sampleRate: 0 }, { ...valid, durationSeconds: NaN }, { ...valid, positionSeconds: -1 }, { ...valid, locale: "fr" }, { ...valid, track: {} }]) expect(isNativeVisualizerState(invalid)).toBe(false);
  });
});
