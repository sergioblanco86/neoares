import { afterEach, describe, expect, it, vi } from "vitest";
import type { DualDeckMixer } from "../../audio/dual-deck-mixer";
import { OwnerAudioBridge } from "./owner-bridge";

afterEach(() => vi.unstubAllGlobals());
describe("owner bridge async disposal", () => {
  it("cancels an in-flight worklet load and releases only its own tap once", async () => {
    let resolve!: () => void;
    const context = { audioWorklet: { addModule: vi.fn(() => new Promise<void>(done => { resolve = done; })) } };
    const tap = { context, release: vi.fn() };
    const mixer = { createPostMasterAnalysisTap: vi.fn(() => tap) } as unknown as DualDeckMixer;
    const peer = { close: vi.fn() } as unknown as MessagePort;
    const node = vi.fn(); vi.stubGlobal("AudioWorkletNode", node);
    const bridge = new OwnerAudioBridge(mixer, peer, "generation");
    const attach = bridge.attach(); bridge.dispose(); bridge.dispose(); resolve(); await attach;
    expect(node).not.toHaveBeenCalled(); expect(tap.release).toHaveBeenCalledOnce(); expect(peer.close).toHaveBeenCalledOnce();
  });
  it("releases tap/port on loading failure instead of leaking or reconnecting master", async () => {
    const tap = { context: { audioWorklet: { addModule: vi.fn(async () => { throw new Error("load failed"); }) } }, release: vi.fn() };
    const mixer = { createPostMasterAnalysisTap: () => tap } as unknown as DualDeckMixer;
    const peer = { close: vi.fn() } as unknown as MessagePort;
    const bridge = new OwnerAudioBridge(mixer, peer, "generation");
    await expect(bridge.attach()).rejects.toThrow("load failed");
    expect(tap.release).toHaveBeenCalledOnce(); expect(peer.close).toHaveBeenCalledOnce();
  });
});
