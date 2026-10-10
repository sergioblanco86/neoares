export type RenderQuality = "low" | "medium" | "high";

const LEVELS: RenderQuality[] = ["low", "medium", "high"];

/** Keeps adaptive quality decisions off React's per-frame render path. */
export class FrameMonitor {
  #level: RenderQuality;
  #lastFrameAt: number | null = null;
  #emaFps: number | null = null;
  #slowSince: number | null = null;
  #fastSince: number | null = null;
  #lastChangeAt = -Infinity;

  constructor(initial: RenderQuality = "medium") { this.#level = initial; }

  sample(timestamp: number): RenderQuality | null {
    if (this.#lastFrameAt === null) { this.#lastFrameAt = timestamp; return null; }
    const delta = Math.max(1, timestamp - this.#lastFrameAt);
    this.#lastFrameAt = timestamp;
    const fps = 1_000 / delta;
    this.#emaFps = this.#emaFps === null ? fps : this.#emaFps * 0.92 + fps * 0.08;
    if (timestamp - this.#lastChangeAt < 5_000) return null;
    if (this.#emaFps < 48) {
      this.#slowSince ??= timestamp;
      this.#fastSince = null;
      if (timestamp - this.#slowSince >= 3_000) return this.change(-1, timestamp);
      return null;
    }
    if (this.#emaFps > 58) {
      this.#fastSince ??= timestamp;
      this.#slowSince = null;
      if (timestamp - this.#fastSince >= 10_000) return this.change(1, timestamp);
      return null;
    }
    this.#slowSince = null;
    this.#fastSince = null;
    return null;
  }

  private change(offset: -1 | 1, timestamp: number): RenderQuality | null {
    const next = LEVELS[Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(this.#level) + offset))];
    this.#slowSince = null;
    this.#fastSince = null;
    this.#lastChangeAt = timestamp;
    if (next === this.#level) return null;
    this.#level = next;
    return next;
  }
}
