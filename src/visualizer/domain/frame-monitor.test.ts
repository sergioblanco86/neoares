import { describe, expect, it } from "vitest";
import { FrameMonitor } from "./frame-monitor";

describe("FrameMonitor", () => {
  it("lowers adaptive quality after sustained sub-48 FPS rendering", () => {
    const monitor = new FrameMonitor("high");
    let changed: string | null = null;
    for (let timestamp = 0; timestamp <= 9_000; timestamp += 25) changed = monitor.sample(timestamp) ?? changed;
    expect(changed).toBe("medium");
  });

  it("raises adaptive quality only after a stable 10-second headroom period", () => {
    const monitor = new FrameMonitor("medium");
    let changed: string | null = null;
    for (let timestamp = 0; timestamp <= 16_000; timestamp += 16) changed = monitor.sample(timestamp) ?? changed;
    expect(changed).toBe("high");
  });
});
