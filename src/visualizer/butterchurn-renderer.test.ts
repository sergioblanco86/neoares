import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("butterchurn", () => ({ default: { createVisualizer: mocks.create } }));
import { ButterchurnRenderer } from "./butterchurn-renderer";
import type { MixerAnalysisTap } from "../audio/dual-deck-mixer";

function setup() {
  const instance = {
    connectAudio: vi.fn(), disconnectAudio: vi.fn(), loadPreset: vi.fn<(definition: unknown, seconds: number) => Promise<void>>(async () => undefined), render: vi.fn(),
    setRendererSize: vi.fn(), loseGLContext: vi.fn(), internalCanvas: new EventTarget(), audio: { timeArray: new Int8Array([0, 64, -64, 0]) },
  };
  mocks.create.mockReturnValue(instance);
  return { instance, tap: { context: {}, node: {}, release: vi.fn() } as unknown as MixerAnalysisTap, canvas: { width: 640, height: 360 } as HTMLCanvasElement };
}
beforeEach(() => vi.clearAllMocks());
const definition = { init_eqs_eel: "" };

describe("ButterchurnRenderer", () => {
  it("awaits WASM before rendering and serializes subsequent loads without rebuilding", async () => {
    const { instance, canvas, tap } = setup();
    const renderer = new ButterchurnRenderer(); await renderer.initialize(canvas, tap);
    let release!: () => void;
    instance.loadPreset.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = renderer.loadPreset(definition, 3), second = renderer.loadPreset({ ...definition, name: "second" }, 2);
    await Promise.resolve(); await Promise.resolve();
    renderer.render(); expect(instance.render).not.toHaveBeenCalled();
    expect(instance.loadPreset).toHaveBeenCalledTimes(1);
    release(); await Promise.all([first, second]);
    expect(instance.loadPreset.mock.calls.map(call => call[1])).toEqual([0, 2]);
    renderer.render(); renderer.resize(1280, 720);
    expect(instance.render).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][2]).toMatchObject({ onlyUseWASM: true });
    expect(instance.connectAudio).toHaveBeenCalledOnce();
    expect(renderer.getAudioRms()).toBeCloseTo(Math.sqrt(0.125));
    renderer.dispose(); renderer.dispose();
    expect(instance.disconnectAudio).toHaveBeenCalledExactlyOnceWith(tap.node);
    expect(instance.loseGLContext).toHaveBeenCalledOnce();
  });

  it("forwards context loss from the actual internal WebGL surface, not the 2D output", async () => {
    const { instance, canvas, tap } = setup(); const lost = vi.fn(), restored = vi.fn();
    const renderer = new ButterchurnRenderer(); await renderer.initialize(canvas, tap, lost, restored);
    const event = new Event("webglcontextlost", { cancelable: true }); instance.internalCanvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); expect(lost).toHaveBeenCalledOnce();
    instance.internalCanvas.dispatchEvent(new Event("webglcontextrestored")); expect(restored).toHaveBeenCalledOnce();
    renderer.dispose(); instance.internalCanvas.dispatchEvent(new Event("webglcontextrestored")); expect(restored).toHaveBeenCalledOnce();
  });

  it("surfaces compilation failures and refuses JavaScript-only presets", async () => {
    const { instance, canvas, tap } = setup(); const renderer = new ButterchurnRenderer(); await renderer.initialize(canvas, tap);
    instance.loadPreset.mockRejectedValueOnce(new Error("WASM_COMPILE_FAILED"));
    await expect(renderer.loadPreset(definition, 0)).rejects.toThrow("WASM_COMPILE_FAILED");
    await expect(renderer.loadPreset({ init_eqs_str: "evil()" }, 0)).rejects.toThrow("VISUALIZER_PRESET_REIMPORT_REQUIRED");
    renderer.render(); expect(instance.render).not.toHaveBeenCalled(); renderer.dispose();
  });
});
