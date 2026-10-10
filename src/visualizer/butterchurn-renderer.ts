import type { MixerAnalysisTap } from "../audio/dual-deck-mixer";
import { PRESET_KEYS } from "./preset-catalog";

type ButterchurnInstance = {
  connectAudio(node: AudioNode): void;
  disconnectAudio(node: AudioNode): void;
  loadPreset(definition: unknown, blendSeconds: number): Promise<void>;
  render(options?: { elapsedTime?: number }): void;
  setRendererSize(width: number, height: number): void;
  loseGLContext(): void;
  internalCanvas: HTMLCanvasElement | OffscreenCanvas;
  gl: WebGL2RenderingContext;
  audio: { timeArray: Int8Array };
};
type ButterchurnFactory = { createVisualizer(context: AudioContext, canvas: HTMLCanvasElement, options?: { width?: number; height?: number; onlyUseWASM?: boolean }): ButterchurnInstance };

export class ButterchurnRenderer {
  #instance: ButterchurnInstance | null = null;
  #tap: MixerAnalysisTap | null = null;
  #disposed = false;
  #ready = false;
  #loadChain: Promise<void> = Promise.resolve();
  #removeContextListeners: (() => void) | null = null;

  async initialize(canvas: HTMLCanvasElement, tap: MixerAnalysisTap, onContextLost?: () => void, onContextRestored?: () => void): Promise<void> {
    const module = await import("butterchurn") as unknown as { default?: ButterchurnFactory } & ButterchurnFactory;
    if (this.#disposed) return;
    const butterchurn = module.default ?? module;
    try {
      this.#instance = butterchurn.createVisualizer(tap.context, canvas, { width: canvas.width, height: canvas.height, onlyUseWASM: true });
    } catch (cause) { throw new Error("VISUALIZER_INITIALIZATION_FAILED", { cause }); }
    this.#instance.connectAudio(tap.node);
    this.#tap = tap;
    // v3 renders WebGL into an internal (usually OffscreenCanvas) surface.
    // The output canvas is 2D and never emits the engine's context events.
    const surface = this.#instance.internalCanvas;
    const lost = (event: Event) => { event.preventDefault(); this.#ready = false; onContextLost?.(); };
    const restored = () => onContextRestored?.();
    surface.addEventListener("webglcontextlost", lost);
    surface.addEventListener("webglcontextrestored", restored);
    this.#removeContextListeners = () => {
      surface.removeEventListener("webglcontextlost", lost);
      surface.removeEventListener("webglcontextrestored", restored);
    };
  }

  loadPreset(definition: unknown, transitionSeconds: number): Promise<void> {
    const instance = this.#instance;
    if (!instance || this.#disposed) return Promise.reject(new Error("VISUALIZER_RENDERER_NOT_READY"));
    if (!definition || typeof definition !== "object" || !("init_eqs_eel" in definition)) return Promise.reject(new Error("VISUALIZER_PRESET_REIMPORT_REQUIRED"));
    // WASM compilation is asynchronous. Serialize loads so an older selection
    // can never finish after a newer one and silently replace it.
    const next = this.#loadChain.catch(() => undefined).then(async () => {
      if (this.#disposed) return;
      try {
        await instance.loadPreset(definition, this.#ready ? transitionSeconds : 0);
        if (!this.#disposed) this.#ready = true;
      } finally {
        if (this.#disposed) instance.loseGLContext();
      }
    });
    this.#loadChain = next;
    return next;
  }

  render(elapsedTime?: number): void { if (this.#ready) this.#instance?.render({ elapsedTime }); }
  resize(width: number, height: number): void { this.#instance?.setRendererSize(width, height); }
  get maxTextureSize(): number {
    const gl = this.#instance?.gl;
    return gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 3840;
  }
  /** Measures PCM actually consumed by Butterchurn, not an invented animation signal. */
  getAudioRms(): number {
    const samples = this.#instance?.audio.timeArray;
    if (!samples?.length) return 0;
    let sum = 0;
    for (const value of samples) sum += (value / 128) ** 2;
    return Math.sqrt(sum / samples.length);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#ready = false;
    this.#removeContextListeners?.();
    if (this.#instance && this.#tap) this.#instance.disconnectAudio(this.#tap.node);
    this.#instance?.loseGLContext();
    this.#instance = null;
    this.#tap = null;
  }
}

export async function loadBundledPresetDefinitions(): Promise<Record<string, unknown>> {
  const modules = await Promise.all([
    import("butterchurn-presets/presets/converted/Aderrasi - Potion of Spirits.json"),
    import("butterchurn-presets/presets/converted/Geiss - Spiral Artifact.json"),
    import("butterchurn-presets/presets/converted/MilkDrop2077.R002.json"),
    import("butterchurn-presets/presets/converted/Rovastar - Oozing Resistance.json"),
    import("butterchurn-presets/presets/converted/martin - angel flight.json"),
    import("butterchurn-presets/presets/converted/_Geiss - Artifact 01.json"),
  ]);
  return Object.fromEntries(PRESET_KEYS.map((key, index) => [key, modules[index].default]));
}
