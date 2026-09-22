import { describe, expect, it, vi } from "vitest";
import { createSingleFlight } from "./single-flight";

describe("createSingleFlight", () => {
  it("shares one in-flight operation with every caller", async () => {
    let resolveGate!: (value: number) => void;
    const gate = new Promise<number>((resolve) => {
      resolveGate = resolve;
    });
    const task = vi.fn(() => gate);
    const singleFlight = createSingleFlight<number>();

    const first = singleFlight.run(task);
    const second = singleFlight.run(task);
    await Promise.resolve();

    expect(first).toBe(second);
    expect(singleFlight.isActive()).toBe(true);
    expect(task).toHaveBeenCalledTimes(1);

    resolveGate(5);
    await expect(first).resolves.toBe(5);
    expect(singleFlight.isActive()).toBe(false);
  });

  it("allows another operation after either success or failure", async () => {
    const singleFlight = createSingleFlight<number>();

    await expect(singleFlight.run(async () => Promise.reject(new Error("falló")))).rejects.toThrow("falló");
    await expect(singleFlight.run(async () => 8)).resolves.toBe(8);
  });
});
