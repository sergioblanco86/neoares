export type GainPoint = {
  at: number;
  outgoing: number;
  incoming: number;
};

export function equalPowerCrossfade(steps = 32): GainPoint[] {
  if (!Number.isInteger(steps) || steps < 2) {
    throw new Error("CROSSFADE_STEPS_INVALID: se requieren al menos dos pasos");
  }

  return Array.from({ length: steps }, (_, index) => {
    const at = index / (steps - 1);
    return {
      at,
      outgoing: Math.cos(at * 0.5 * Math.PI),
      incoming: Math.cos((1 - at) * 0.5 * Math.PI),
    };
  });
}

export function isSafeEmergencyLoop(
  startSeconds: number,
  endSeconds: number,
  beatsPerBar: number,
  bpm: number,
  toleranceSeconds = 0.08,
): boolean {
  if (startSeconds < 0 || endSeconds <= startSeconds || beatsPerBar <= 0 || bpm <= 0) return false;
  const beatDuration = 60 / bpm;
  const beats = (endSeconds - startSeconds) / beatDuration;
  const bars = beats / beatsPerBar;
  const allowedBars = [1, 2, 4, 8];
  return allowedBars.some((allowed) => Math.abs(bars - allowed) * beatsPerBar * beatDuration <= toleranceSeconds);
}
