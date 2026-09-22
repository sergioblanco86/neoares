import { describe, expect, it } from "vitest";
import { canTransitionSession, isTerminalSessionState, transitionSession } from "./session-machine";

describe("session state machine", () => {
  it("allows the normal playback lifecycle", () => {
    expect(canTransitionSession("CREATED", "PREPARING")).toBe(true);
    expect(canTransitionSession("PREPARING", "READY")).toBe(true);
    expect(canTransitionSession("READY", "PLAYING")).toBe(true);
    expect(canTransitionSession("PLAYING", "DRAINING")).toBe(true);
    expect(canTransitionSession("DRAINING", "COMPLETED")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(isTerminalSessionState("COMPLETED")).toBe(true);
    expect(() => transitionSession("COMPLETED", "PLAYING")).toThrow("SESSION_TRANSITION_INVALID");
  });

  it("treats duplicate state application as idempotent", () => {
    expect(transitionSession("PLAYING", "PLAYING")).toBe("PLAYING");
  });
});
