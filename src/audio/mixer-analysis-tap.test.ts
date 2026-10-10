import { afterEach, describe, expect, it, vi } from "vitest";
import { DualDeckMixer } from "./dual-deck-mixer";

afterEach(() => vi.unstubAllGlobals());
describe("post-master analysis tap", () => {
  it("never resumes or reconnects output, survives reset, and releases only its own master edge once", async () => {
    const gains: Array<{ gain: { value: number }; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    const node = () => { const result = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }; result.connect.mockImplementation(destination => destination); return result; };
    const compressor = { ...node(), threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} };
    const context = { destination: {}, createGain: () => { const result = node(); gains.push(result); return result; }, createDynamicsCompressor: () => compressor, resume: vi.fn(), close: vi.fn() };
    vi.stubGlobal("AudioContext", class { constructor() { return context; } });
    const mixer = new DualDeckMixer(), tap = mixer.createPostMasterAnalysisTap();
    expect(tap.context).toBe(context); expect(tap.node.gain.value).toBe(1);
    expect(gains[0].connect.mock.calls).toEqual([[context.destination], [tap.node]]);
    expect(context.resume).not.toHaveBeenCalled();
    mixer.reset(); expect(gains[0].disconnect).not.toHaveBeenCalled();
    tap.release(); tap.release();
    expect(gains[0].disconnect).toHaveBeenCalledExactlyOnceWith(tap.node);
    expect(gains[2].disconnect).toHaveBeenCalledOnce();
    const second = mixer.createPostMasterAnalysisTap(); await mixer.dispose(); second.release();
    expect(gains[0].disconnect).toHaveBeenCalledTimes(2); expect(context.close).toHaveBeenCalledOnce();
  });
});
