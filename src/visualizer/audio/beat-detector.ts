const WINDOW_MS = 700;
const THRESHOLD = 1.35;
const MIN_ENERGY = 0.12;
const DECAY_MS = 180;

export class BeatDetector {
  readonly #samples: Array<{ at: number; energy: number }> = [];
  #value = 0;
  #lastAt = 0;
  #lastOnset = -Infinity;

  update(energy: number, timestamp: number): number {
    while (this.#samples.length && this.#samples[0].at < timestamp - WINDOW_MS) this.#samples.shift();
    const mean = this.#samples.length ? this.#samples.reduce((sum, sample) => sum + sample.energy, 0) / this.#samples.length : energy;
    this.#value *= Math.exp(-Math.max(0, timestamp - this.#lastAt) / DECAY_MS);
    if (energy >= MIN_ENERGY && energy > mean * THRESHOLD && timestamp - this.#lastOnset > 100) {
      this.#value = Math.min(1, (energy - mean) / Math.max(MIN_ENERGY, mean));
      this.#lastOnset = timestamp;
    }
    this.#samples.push({ at: timestamp, energy });
    this.#lastAt = timestamp;
    return this.#value;
  }

  reset(): void { this.#samples.length = 0; this.#value = 0; this.#lastAt = 0; this.#lastOnset = -Infinity; }
}
