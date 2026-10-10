import type { MixerAnalysisTap } from "../../audio/dual-deck-mixer";
import { BeatDetector } from "./beat-detector";

export type AudioAnalysisFrame = {
  volume: number; bass: number; mids: number; highs: number; beat: number;
  waveform: Float32Array<ArrayBuffer>; frequencySpectrum: Float32Array<ArrayBuffer>; timestamp: number;
};

export class AudioAnalyzer {
  readonly frame: AudioAnalysisFrame;
  readonly #node: AnalyserNode;
  readonly #tap: MixerAnalysisTap;
  readonly #beat = new BeatDetector();
  #lastAt = 0;
  #disposed = false;

  constructor(tap: MixerAnalysisTap) {
    this.#tap = tap;
    this.#node = tap.context.createAnalyser();
    this.#node.fftSize = 2048;
    this.#node.smoothingTimeConstant = 0.75;
    this.#node.minDecibels = -90;
    this.#node.maxDecibels = -10;
    tap.node.connect(this.#node);
    this.frame = { volume: 0, bass: 0, mids: 0, highs: 0, beat: 0, timestamp: 0, waveform: new Float32Array(2048), frequencySpectrum: new Float32Array(1024) };
  }

  sample(timestamp: number): AudioAnalysisFrame {
    const frame = this.frame;
    if (this.#disposed) return frame;
    const decay = Math.exp(-Math.max(0, timestamp - this.#lastAt) / 180);
    this.#lastAt = timestamp;
    frame.timestamp = timestamp;
    if (this.#tap.context.state !== "running") {
      frame.waveform.fill(0); frame.frequencySpectrum.fill(0);
      frame.volume *= decay; frame.bass *= decay; frame.mids *= decay; frame.highs *= decay;
    } else {
      this.#node.getFloatTimeDomainData(frame.waveform);
      this.#node.getFloatFrequencyData(frame.frequencySpectrum);
      let sum = 0;
      for (const value of frame.waveform) sum += value * value;
      frame.volume = Math.max(Math.min(1, Math.sqrt(sum / frame.waveform.length)), frame.volume * decay);
      for (let index = 0; index < frame.frequencySpectrum.length; index += 1) {
        const db = frame.frequencySpectrum[index];
        frame.frequencySpectrum[index] = Number.isFinite(db) ? Math.min(1, 10 ** (db / 20)) : 0;
      }
      const binHz = this.#tap.context.sampleRate / this.#node.fftSize;
      frame.bass = Math.max(bandRms(frame.frequencySpectrum, binHz, 20, 250), frame.bass * decay);
      frame.mids = Math.max(bandRms(frame.frequencySpectrum, binHz, 250, 4000), frame.mids * decay);
      frame.highs = Math.max(bandRms(frame.frequencySpectrum, binHz, 4000, 16000), frame.highs * decay);
    }
    frame.beat = this.#beat.update(frame.bass, timestamp);
    return frame;
  }

  reset(): void {
    this.frame.waveform.fill(0); this.frame.frequencySpectrum.fill(0);
    this.frame.volume = this.frame.bass = this.frame.mids = this.frame.highs = this.frame.beat = 0;
    this.#beat.reset(); this.#lastAt = 0;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#tap.node.disconnect(this.#node);
    this.#node.disconnect(); this.reset();
  }
}

export function bandRms(spectrum: Float32Array, binHz: number, fromHz: number, toHz: number): number {
  const start = Math.max(1, Math.ceil(fromHz / binHz));
  const end = Math.min(spectrum.length, Math.ceil(toHz / binHz));
  let sum = 0;
  for (let index = start; index < end; index += 1) sum += spectrum[index] ** 2;
  return end > start ? Math.min(1, Math.sqrt(sum / (end - start))) : 0;
}
