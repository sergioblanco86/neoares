import type { EqualizerCurve } from "../shared/contracts";
import { EQUALIZER_FREQUENCIES } from "../shared/equalizer";

/** One stable serial path, before the safety gain/limiter and visualizer tap. */
export class EqualizerGraph {
  readonly input: GainNode;
  readonly filters: BiquadFilterNode[];

  constructor(private readonly context: BaseAudioContext, output: AudioNode) {
    this.input = context.createGain();
    this.filters = EQUALIZER_FREQUENCIES.map(frequency => {
      const filter = context.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = Math.min(frequency, context.sampleRate * 0.45);
      filter.Q.value = 1.4;
      filter.gain.value = 0;
      return filter;
    });
    let tail: AudioNode = this.input;
    for (const filter of this.filters) { tail.connect(filter); tail = filter; }
    tail.connect(output);
  }

  configure(curve: EqualizerCurve & { enabled: boolean }, immediate = false): void {
    const gains = EQUALIZER_FREQUENCIES.map((_, index) => curve.enabled ? finiteGain(curve.gainsDb[index]) : 0);
    const preamp = curve.enabled ? finiteGain(curve.preampDb) : 0;
    // A band changes its frequency region, not broadband gain. The downstream
    // safety gain/limiter handles actual signal peaks; preamp remains user-controlled.
    smooth(this.input.gain, 10 ** (preamp / 20), this.context.currentTime, immediate);
    this.filters.forEach((filter, index) => smooth(filter.gain, gains[index], this.context.currentTime, immediate));
  }

  dispose(): void { this.input.disconnect(); for (const filter of this.filters) filter.disconnect(); }
}

function finiteGain(value: number): number { return Number.isFinite(value) ? Math.max(-12, Math.min(12, value)) : 0; }
function smooth(param: AudioParam, value: number, now: number, immediate: boolean): void {
  if (immediate) { param.value = value; return; }
  param.cancelAndHoldAtTime(now);
  param.setTargetAtTime(value, now, 0.02);
}
