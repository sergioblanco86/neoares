export type PreparationStatus = "queued" | "preparing" | "ready" | "failed";
type Entry<S, T> = { source: S; status: PreparationStatus; result?: T; error?: unknown; promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };

/** Owns only the desired upcoming window. Jobs never mutate mixer decks. */
export class UpcomingPreparation<S extends { id: string }, T> {
  readonly #entries = new Map<string, Entry<S, T>>();
  #order: string[] = [];
  #active = 0;

  constructor(
    private readonly prepare: (source: S, isCurrent: () => boolean) => Promise<T>,
    private readonly changed: () => void,
    private readonly failed: (source: S, error: unknown) => void,
    readonly capacity = 4,
    readonly concurrency = 2,
  ) {}

  sync(sources: readonly S[]): void {
    const window = [...new Map(sources.map(source => [source.id, source])).values()].slice(0, this.capacity);
    this.#order = window.map(source => source.id);
    for (const [id, entry] of this.#entries) {
      if (this.#order.includes(id)) continue;
      this.#entries.delete(id);
      entry.reject(new Error("PREPARATION_SUPERSEDED"));
    }
    for (const source of window) {
      if (this.#entries.has(source.id)) continue;
      let resolve!: (value: T) => void, reject!: (error: unknown) => void;
      const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
      void promise.catch(() => undefined); // An unused speculative job may fail.
      this.#entries.set(source.id, { source, status: "queued", promise, resolve, reject });
    }
    this.changed();
    this.#pump();
  }

  get(id: string): T | undefined { return this.#entries.get(id)?.result; }
  status(id: string): PreparationStatus | undefined { return this.#entries.get(id)?.status; }
  waitFor(id: string): Promise<T> {
    return this.#entries.get(id)?.promise ?? Promise.reject(new Error("PREPARATION_NOT_REQUESTED"));
  }
  statuses(): Record<string, PreparationStatus> {
    return Object.fromEntries([...this.#entries].map(([id, entry]) => [id, entry.status]));
  }
  clear(): void {
    this.#order = [];
    for (const entry of this.#entries.values()) entry.reject(new Error("PREPARATION_SUPERSEDED"));
    this.#entries.clear();
    // Running jobs still count until they settle, bounding downloads even on reset.
    this.changed();
  }

  #pump(): void {
    while (this.#active < this.concurrency) {
      const entry = this.#order.map(id => this.#entries.get(id)).find(candidate => candidate?.status === "queued");
      if (!entry) return;
      entry.status = "preparing";
      this.#active++;
      this.changed();
      void Promise.resolve().then(() => {
        if (this.#entries.get(entry.source.id) !== entry) throw new Error("PREPARATION_SUPERSEDED");
        return this.prepare(entry.source, () => this.#entries.get(entry.source.id) === entry);
      }).then(result => {
        if (this.#entries.get(entry.source.id) !== entry) return;
        entry.result = result;
        entry.status = "ready";
        entry.resolve(result);
        this.changed();
      }, error => {
        if (this.#entries.get(entry.source.id) !== entry) return;
        entry.error = error;
        entry.status = "failed";
        entry.reject(error);
        this.changed();
        this.failed(entry.source, error);
      }).finally(() => { this.#active--; this.#pump(); });
    }
  }
}
