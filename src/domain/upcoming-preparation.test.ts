import { describe, expect, it, vi } from "vitest";
import { UpcomingPreparation } from "./upcoming-preparation";

const tracks = "abcdefg".split("").map(id => ({ id }));
function deferred<T>() { let resolve!: (value: T) => void, reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const tick = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
function fixture() {
  const jobs = new Map<string, ReturnType<typeof deferred<string>>>();
  const prepare = vi.fn((source: { id: string }) => { const pending = deferred<string>(); jobs.set(source.id, pending); return pending.promise; });
  const failed = vi.fn(), changed = vi.fn();
  const pool = new UpcomingPreparation(prepare, changed, failed);
  return { pool, jobs, prepare, failed, changed };
}

describe("four-track preparation reserve", () => {
  it("bounds the window to four and concurrency to two, exposing the first without waiting for the other three", async () => {
    const { pool, jobs, prepare } = fixture(); pool.sync(tracks); await tick();
    expect(prepare.mock.calls.map(([source]) => source.id)).toEqual(["a", "b"]);
    expect(Object.keys(pool.statuses())).toEqual(["a", "b", "c", "d"]);
    jobs.get("a")!.resolve("decoded-a"); await tick();
    expect(pool.get("a")).toBe("decoded-a"); expect(pool.status("b")).toBe("preparing");
    expect(prepare.mock.calls.map(([source]) => source.id)).toEqual(["a", "b", "c"]);
    jobs.get("b")!.resolve("decoded-b"); await tick();
    jobs.get("c")!.resolve("decoded-c"); jobs.get("d")!.resolve("decoded-d"); await tick();
    expect(Object.values(pool.statuses())).toEqual(["ready", "ready", "ready", "ready"]);
  });
  it("consuming a track preserves three decoded results and prepares the new fourth", async () => {
    const { pool, jobs, prepare } = fixture(); pool.sync(tracks); await tick();
    jobs.get("a")!.resolve("a"); jobs.get("b")!.resolve("b"); await tick();
    jobs.get("c")!.resolve("c"); jobs.get("d")!.resolve("d"); await tick();
    pool.sync(tracks.slice(1)); await tick();
    expect(pool.get("b")).toBe("b"); expect(pool.get("c")).toBe("c"); expect(pool.get("d")).toBe("d");
    expect(pool.get("a")).toBeUndefined(); expect(pool.status("e")).toBe("preparing");
    expect(prepare).toHaveBeenCalledTimes(5);
  });
  it("reorders by ID without decoding again and discards results for removed jobs", async () => {
    const { pool, jobs, prepare, failed } = fixture(); pool.sync(tracks); await tick();
    jobs.get("a")!.resolve("a"); await tick();
    pool.sync([tracks[2], tracks[0], tracks[3], tracks[4]]);
    jobs.get("b")!.resolve("removed"); await tick();
    expect(pool.get("b")).toBeUndefined(); expect(pool.get("a")).toBe("a");
    expect(prepare.mock.calls.filter(([source]) => source.id === "a")).toHaveLength(1);
    expect(failed).not.toHaveBeenCalled();
  });
  it("reset invalidates outstanding waits/completions but never exceeds concurrency", async () => {
    const { pool, jobs, prepare, failed } = fixture(); pool.sync(tracks); await tick();
    const waiting = pool.waitFor("a"); pool.clear();
    await expect(waiting).rejects.toThrow("PREPARATION_SUPERSEDED");
    pool.sync(tracks.slice(4)); await tick(); expect(prepare).toHaveBeenCalledTimes(2);
    jobs.get("a")!.resolve("stale"); jobs.get("b")!.reject(new Error("stale-error")); await tick();
    expect(prepare.mock.calls.map(([source]) => source.id)).toEqual(["a", "b", "e", "f"]);
    expect(pool.get("a")).toBeUndefined(); expect(failed).not.toHaveBeenCalled();
  });
  it("reports an actual failure and continues preparing the remaining queue", async () => {
    const { pool, jobs, failed } = fixture(); pool.sync(tracks); await tick();
    const error = new Error("download failed"); jobs.get("a")!.reject(error); await tick();
    expect(pool.status("a")).toBe("failed"); expect(failed).toHaveBeenCalledExactlyOnceWith(tracks[0], error);
    await expect(pool.waitFor("a")).rejects.toBe(error); expect(pool.status("c")).toBe("preparing");
  });
  it("does not even start a provider operation if cleared before its task runs", async () => {
    const { pool, prepare } = fixture(); pool.sync(tracks); pool.clear(); await tick();
    expect(prepare).not.toHaveBeenCalled(); expect(pool.statuses()).toEqual({});
  });
});
