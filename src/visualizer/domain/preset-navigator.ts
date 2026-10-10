import type { VisualizerPresetDescriptor } from "../../shared/contracts";

export class PresetNavigator {
  #entries: readonly VisualizerPresetDescriptor[] = [];
  #current: string | null = null;
  #history: string[] = [];
  readonly #failed = new Set<string>();

  setEntries(entries: readonly VisualizerPresetDescriptor[]): void { this.#entries = entries; }
  get current(): string | null { return this.#current; }
  get history(): readonly string[] { return this.#history; }
  markFailed(id: string): void { this.#failed.add(id); }
  retry(id: string): void { this.#failed.delete(id); }

  select(id: string, remember = true): string {
    if (!this.#valid().some(entry => entry.id === id)) throw new Error("VISUALIZER_NO_VALID_PRESET");
    if (id !== this.#current) {
      if (remember && this.#current) this.#history.push(this.#current);
      this.#history = this.#history.slice(-20);
      this.#current = id;
    }
    return id;
  }

  next(): string {
    const valid = this.#valid();
    if (!valid.length) throw new Error("VISUALIZER_NO_VALID_PRESET");
    const index = valid.findIndex(entry => entry.id === this.#current);
    return this.select(valid[(index + 1) % valid.length].id);
  }

  previous(): string {
    const valid = new Set(this.#valid().map(entry => entry.id));
    while (this.#history.length) {
      const id = this.#history.pop()!;
      if (valid.has(id) && id !== this.#current) return this.select(id, false);
    }
    return this.#current && valid.has(this.#current) ? this.#current : this.next();
  }

  random(random: () => number = Math.random): string {
    const valid = this.#valid();
    if (!valid.length) throw new Error("VISUALIZER_NO_VALID_PRESET");
    const recent = [this.#current, ...this.#history.slice(-10).reverse()];
    let candidates = valid.filter(entry => !recent.includes(entry.id));
    while (!candidates.length && recent.length > 1) { recent.pop(); candidates = valid.filter(entry => !recent.includes(entry.id)); }
    if (!candidates.length) candidates = valid;
    return this.select(candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))].id);
  }

  #valid(): VisualizerPresetDescriptor[] { return this.#entries.filter(entry => entry.compatibility === "ready" && !this.#failed.has(entry.id)); }
}
