export type SessionState =
  | "CREATED"
  | "PREPARING"
  | "READY"
  | "PLAYING"
  | "PAUSED"
  | "DRAINING"
  | "STALLED"
  | "COMPLETED"
  | "FAILED"
  | "ABORTED";

const ALLOWED_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
  CREATED: ["PREPARING", "ABORTED", "FAILED"],
  PREPARING: ["READY", "ABORTED", "FAILED"],
  READY: ["PLAYING", "ABORTED", "FAILED"],
  PLAYING: ["PAUSED", "DRAINING", "STALLED", "FAILED", "ABORTED"],
  PAUSED: ["PLAYING", "DRAINING", "ABORTED", "FAILED"],
  DRAINING: ["COMPLETED", "PLAYING", "FAILED", "ABORTED"],
  STALLED: ["PREPARING", "PLAYING", "ABORTED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  ABORTED: [],
};

export function canTransitionSession(from: SessionState, to: SessionState): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionSession(from: SessionState, to: SessionState): SessionState {
  if (!canTransitionSession(from, to)) {
    throw new Error(`SESSION_TRANSITION_INVALID: ${from} → ${to}`);
  }
  return to;
}

export function isTerminalSessionState(state: SessionState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}
