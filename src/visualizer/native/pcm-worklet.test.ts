import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

describe("native worklet bounded pool", () => {
  it("preserves stereo, never waits for consumer, recycles three buffers and stops on dispose", () => {
    let Processor: any;
    const sandbox = { AudioWorkletProcessor: class { port = { onmessage: null }; }, registerProcessor: (_name: string, klass: unknown) => { Processor = klass; }, sampleRate: 44100, currentFrame: 1000, Float32Array, Uint8Array, ArrayBuffer, Date, Math };
    vm.runInNewContext(readFileSync(new URL("./pcm-worklet.js", import.meta.url), "utf8"), sandbox);
    const processor = new Processor({ processorOptions: { generation: "g" } });
    const peer = { onmessage: null as any, start: vi.fn(), close: vi.fn(), postMessage: vi.fn() };
    processor.port.onmessage({ data: { type: "attach", peer } });
    const channels = [[new Float32Array(128).fill(.5), new Float32Array(128).fill(-.5)]];
    for (let i = 0; i < 12; i++) { sandbox.currentFrame += 1000; expect(processor.process(channels)).toBe(true); }
    expect(peer.postMessage).toHaveBeenCalledTimes(3); expect(processor.pool.length).toBe(0);
    const frame = peer.postMessage.mock.calls[2][0];
    expect(frame.sampleRate).toBe(44100); expect(frame.generation).toBe("g"); expect(frame.sequence).toBe(3);
    expect(new Uint8Array(frame.buffer, 0, 1024)[1023]).toBe(128);
    expect(new Uint8Array(frame.buffer, 1024, 1024)[1023]).toBe(192);
    expect(new Uint8Array(frame.buffer, 2048, 1024)[1023]).toBe(64);
    peer.onmessage({ data: { type: "return", generation: "wrong", buffer: frame.buffer } }); expect(processor.pool.length).toBe(0);
    peer.onmessage({ data: { type: "return", generation: "g", buffer: frame.buffer } });
    sandbox.currentFrame += 1000; processor.process(channels); expect(peer.postMessage).toHaveBeenCalledTimes(4);
    processor.port.onmessage({ data: { type: "visible", visible: false } }); sandbox.currentFrame += 1000; processor.process(channels); expect(peer.postMessage).toHaveBeenCalledTimes(4);
    processor.port.onmessage({ data: { type: "dispose" } }); expect(processor.process(channels)).toBe(false); expect(peer.close).toHaveBeenCalledOnce();
  });
});
