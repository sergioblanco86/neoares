import type { DualDeckMixer, MixerAnalysisTap } from "../audio/dual-deck-mixer";
import type { VisualizerSettings } from "../shared/contracts";
import { AudioAnalyzer } from "./audio/audio-analyzer";
import { ButterchurnRenderer } from "./butterchurn-renderer";
import { FrameMonitor, type RenderQuality } from "./domain/frame-monitor";

export class VisualizerController {
  renderer = new ButterchurnRenderer();
  readonly #canvas: HTMLCanvasElement;
  readonly #tap: MixerAnalysisTap;
  readonly #analyzer: AudioAnalyzer;
  readonly #observer: ResizeObserver;
  readonly #monitor = new FrameMonitor("medium");
  readonly #onError: (error: unknown) => void;
  readonly #onRestore: () => void;
  #settings: Pick<VisualizerSettings, "quality">;
  #quality: RenderQuality = "medium";
  #frame = 0;
  #lastAt = 0;
  #disposed = false;
  #ready = false;
  #playing = false;
  #visible = true;

  constructor(canvas: HTMLCanvasElement, mixer: DualDeckMixer, settings: VisualizerSettings, onError: (error: unknown) => void, onRestore: () => void) {
    this.#canvas = canvas;
    this.#tap = mixer.createPostMasterAnalysisTap();
    this.#analyzer = new AudioAnalyzer(this.#tap);
    this.#settings = settings;
    this.#onError = onError;
    this.#onRestore = onRestore;
    this.#observer = new ResizeObserver(() => this.resize());
    this.#observer.observe(canvas);
    document.addEventListener("visibilitychange", this.#visibility);
    this.initialized = this.#initializeRenderer();
    void this.initialized.catch(error => { if (!this.#disposed) onError(error); });
  }

  initialized: Promise<void>;

  #initializeRenderer(): Promise<void> {
    return this.renderer.initialize(this.#canvas, this.#tap, () => {
      this.#ready = false; this.#cancel(); this.#onError(new Error("VISUALIZER_CONTEXT_LOST"));
    }, this.#onRestore).then(() => { if (!this.#disposed) this.resize(); });
  }

  async restoreRenderer(): Promise<void> {
    if (this.#disposed) return;
    this.#ready = false; this.#cancel(); this.renderer.dispose();
    this.renderer = new ButterchurnRenderer();
    this.initialized = this.#initializeRenderer();
    await this.initialized;
  }

  async loadPreset(definition: unknown, blendSeconds: number): Promise<void> {
    await this.initialized;
    if (this.#disposed) return;
    await this.renderer.loadPreset(definition, blendSeconds);
    if (this.#disposed) return;
    this.#ready = true;
    this.#schedule();
  }

  configure(settings: VisualizerSettings, playing: boolean, visible = true): void {
    this.#settings = settings; this.#playing = playing; this.resize();
    if (visible !== this.#visible) { this.#visible = visible; this.#visibility(); }
  }

  resize(): void {
    if (this.#disposed) return;
    const quality = this.#settings.quality === "auto" ? this.#quality : this.#settings.quality;
    const scale = quality === "low" ? 0.75 : 1;
    const dprCap = quality === "low" ? 1 : quality === "medium" ? 1.25 : 2;
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    const limit = Math.min(3840, this.renderer.maxTextureSize);
    const width = Math.min(limit, Math.max(1, Math.round(this.#canvas.clientWidth * dpr * scale)));
    const height = Math.min(limit, Math.max(1, Math.round(this.#canvas.clientHeight * dpr * scale)));
    if (width === this.#canvas.width && height === this.#canvas.height) return;
    this.#canvas.width = width; this.#canvas.height = height;
    this.renderer.resize(width, height);
  }

  #visibility = (): void => { this.#cancel(); this.#lastAt = 0; if (!document.hidden && this.#visible) this.#schedule(); };
  #cancel(): void { cancelAnimationFrame(this.#frame); this.#frame = 0; }
  #schedule(): void { if (!this.#frame && !this.#disposed && this.#ready && !document.hidden && this.#visible) this.#frame = requestAnimationFrame(this.#draw); }
  #draw = (timestamp: number): void => {
    this.#frame = 0;
    const quality = this.#settings.quality === "auto" ? this.#quality : this.#settings.quality;
    const interval = !this.#playing ? 1000 / 15 : quality === "low" ? 1000 / 30 : 1000 / 60;
    const delta = timestamp - this.#lastAt;
    // Observe available RAF cadence, not the intentionally capped 15/30 FPS.
    // Otherwise low quality could never recover even on an idle GPU.
    if (this.#playing && this.#settings.quality === "auto") {
      const next = this.#monitor.sample(timestamp);
      if (next) { this.#quality = next; this.resize(); }
    }
    if (!this.#lastAt || delta >= interval - 1) {
      this.#lastAt = timestamp;
      try {
        this.#analyzer.sample(timestamp);
        this.renderer.render(Math.min(0.1, delta / 1000) || 1 / 60);
      } catch (error) { this.#ready = false; this.#onError(error); return; }
    }
    this.#schedule();
  };

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true; this.#cancel();
    document.removeEventListener("visibilitychange", this.#visibility);
    this.#observer.disconnect(); this.renderer.dispose(); this.#analyzer.dispose(); this.#tap.release();
  }
}
