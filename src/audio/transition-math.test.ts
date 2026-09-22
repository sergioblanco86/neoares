import { describe, expect, it } from "vitest";
import { equalPowerCrossfade, isSafeEmergencyLoop } from "./transition-math";

describe("transition math", () => {
  it("builds an equal-power crossfade with exact endpoints", () => {
    const curve = equalPowerCrossfade(5);
    expect(curve[0]).toMatchObject({ at: 0, outgoing: 1 });
    expect(curve[0]?.incoming).toBeCloseTo(0, 10);
    expect(curve.at(-1)).toMatchObject({ at: 1, incoming: 1 });
    expect(curve.at(-1)?.outgoing).toBeCloseTo(0, 10);
  });

  it("accepts loops aligned to supported bar counts", () => {
    expect(isSafeEmergencyLoop(10, 18, 4, 120)).toBe(true);
    expect(isSafeEmergencyLoop(10, 17.2, 4, 120)).toBe(false);
  });
});
