import type { LoudnessAnalysis } from "../shared/contracts";

export type DeckSlot = "A" | "B";

type DeckRuntime = {
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  normalization: GainNode | null;
  analysis: BeatAnalysis | null;
  startedAt: number | null;
  startedOffset: number;
  waveform: number[];
};

export type PlayerSnapshot = {
  durationSeconds: number;
  positionSeconds: number;
  playbackRate: number;
  waveform: number[];
  bpm: number | null;
  playing: boolean;
};

export type BeatAnalysis = {
  bpm: number;
  firstBeatSeconds: number;
  confidence: number;
  loudness: LoudnessAnalysis;
};

export type TransitionReport = {
  mode: "CROSSFADE";
  fromBpm: number;
  toBpm: number;
  playbackRate: number;
  alignmentDelaySeconds: number;
  durationSeconds: number;
  tempoRecoverySeconds: number;
};

export type TransitionPlan = Pick<TransitionReport, "mode" | "playbackRate" | "durationSeconds">;

export function createTransitionPlan(_fromBpm: number, _toBpm: number, requestedDurationSeconds: number): TransitionPlan {
  return {
    mode: "CROSSFADE",
    playbackRate: 1,
    durationSeconds: Math.max(0.25, requestedDurationSeconds),
  };
}

export function calculateCrossfadeDelay(
  durationSeconds: number,
  positionSeconds: number,
  fadeSeconds: number,
  safetySeconds = 0.5,
): number {
  const remainingSeconds = Math.max(0, durationSeconds - positionSeconds);
  return Math.max(0.1, remainingSeconds - fadeSeconds - safetySeconds);
}

export class DualDeckMixer {
  #context: AudioContext | null = null;
  #master: GainNode | null = null;
  #safety: GainNode | null = null;
  #limiter: DynamicsCompressorNode | null = null;
  #volume = 0.9;
  readonly #loadVersions: Record<DeckSlot, number> = { A: 0, B: 0 };
  readonly #transitionTimers = new Set<number>();
  readonly #decks: Record<DeckSlot, DeckRuntime> = {
    A: { buffer: null, source: null, gain: null, normalization: null, analysis: null, startedAt: null, startedOffset: 0, waveform: [] },
    B: { buffer: null, source: null, gain: null, normalization: null, analysis: null, startedAt: null, startedOffset: 0, waveform: [] },
  };

  async unlock(): Promise<void> {
    await this.#ensureContext().resume();
  }

  async load(slot: DeckSlot, bytes: Uint8Array, cachedLoudness?: LoudnessAnalysis | null): Promise<BeatAnalysis> {
    this.unload(slot);
    const loadVersion = this.#loadVersions[slot];
    const context = this.#ensureContext();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const buffer = await context.decodeAudioData(copy.buffer);
    if (loadVersion !== this.#loadVersions[slot]) {
      throw new Error("DECK_LOAD_SUPERSEDED");
    }
    const analysis = { ...analyzeBeatGrid(buffer), loudness: cachedLoudness ?? analyzeLoudness(buffer) };
    this.#decks[slot].buffer = buffer;
    this.#decks[slot].analysis = analysis;
    this.#decks[slot].waveform = summarizeWaveform(buffer.getChannelData(0), 180);
    return analysis;
  }

  async play(slot: DeckSlot, offsetSeconds = 0): Promise<void> {
    const context = this.#ensureContext();
    await context.resume();
    this.#start(slot, 1, context.currentTime, offsetSeconds);
  }

  async pause(): Promise<void> {
    if (this.#context?.state === "running") await this.#context.suspend();
  }

  async resume(): Promise<void> {
    if (this.#context?.state === "suspended") await this.#context.resume();
  }

  seek(slot: DeckSlot, positionSeconds: number): void {
    const deck = this.#decks[slot];
    if (!deck.buffer) return;
    const position = clamp(positionSeconds, 0, Math.max(0, deck.buffer.duration - 0.1));
    this.#start(slot, 1, this.#ensureContext().currentTime, position);
  }

  setVolume(value: number): void {
    this.#volume = clamp(value, 0, 1);
    if (this.#master && this.#context) {
      this.#master.gain.cancelScheduledValues(this.#context.currentTime);
      this.#master.gain.setTargetAtTime(this.#volume, this.#context.currentTime, 0.015);
    }
  }

  getVolume(): number {
    return this.#volume;
  }

  getPlayerSnapshot(slot: DeckSlot): PlayerSnapshot {
    const deck = this.#decks[slot];
    const durationSeconds = deck.buffer?.duration ?? 0;
    const elapsedSeconds = deck.source && deck.startedAt !== null && this.#context
      ? Math.max(0, this.#context.currentTime - deck.startedAt)
      : 0;
    return {
      durationSeconds,
      positionSeconds: clamp(deck.startedOffset + elapsedSeconds, 0, durationSeconds),
      playbackRate: 1,
      waveform: deck.waveform,
      bpm: deck.analysis?.bpm ?? null,
      playing: Boolean(deck.source),
    };
  }

  async crossfade(from: DeckSlot, to: DeckSlot, durationSeconds = 8): Promise<TransitionReport> {
    const context = this.#ensureContext();
    await context.resume();

    const fromDeck = this.#decks[from];
    const fromAnalysis = fromDeck.analysis ?? DEFAULT_ANALYSIS;
    const toAnalysis = this.#decks[to].analysis ?? DEFAULT_ANALYSIS;
    const plan = createTransitionPlan(fromAnalysis.bpm, toAnalysis.bpm, durationSeconds);
    const outgoingPosition = fromDeck.startedAt === null
      ? fromDeck.startedOffset
      : fromDeck.startedOffset + Math.max(0, context.currentTime - fromDeck.startedAt);
    const outgoingRemainingSeconds = Math.max(0, (fromDeck.buffer?.duration ?? 0) - outgoingPosition);
    const outgoingHasAudio = outgoingRemainingSeconds > 0.05;
    const outgoingIsPlaying = Boolean(fromDeck.source && fromDeck.gain && outgoingHasAudio);
    const effectiveDuration = outgoingIsPlaying
      ? Math.min(plan.durationSeconds, Math.max(0.4, outgoingRemainingSeconds))
      : Math.min(0.4, plan.durationSeconds);
    const start = context.currentTime;
    this.#start(to, 0, start, 0);
    const points = 96;
    const fadeOut = new Float32Array(points);
    const fadeIn = new Float32Array(points);
    for (let index = 0; index < points; index += 1) {
      const position = index / (points - 1);
      fadeOut[index] = Math.cos(position * Math.PI * 0.5);
      fadeIn[index] = Math.sin(position * Math.PI * 0.5);
    }

    const activeFrom = this.#decks[from];
    const activeTo = this.#decks[to];
    activeTo.gain!.gain.cancelScheduledValues(start);
    if (outgoingIsPlaying && activeFrom.gain) {
      activeFrom.gain.gain.cancelScheduledValues(start);
      activeFrom.gain.gain.setValueCurveAtTime(fadeOut, start, effectiveDuration);
    }
    activeTo.gain!.gain.setValueCurveAtTime(fadeIn, start, effectiveDuration);
    const timer = window.setTimeout(() => {
      this.#transitionTimers.delete(timer);
      this.#stop(from);
    }, effectiveDuration * 1_000 + 50);
    this.#transitionTimers.add(timer);
    return {
      mode: plan.mode,
      fromBpm: fromAnalysis.bpm,
      toBpm: toAnalysis.bpm,
      playbackRate: 1,
      alignmentDelaySeconds: 0,
      durationSeconds: effectiveDuration,
      tempoRecoverySeconds: 0,
    };
  }

  stopAll(): void {
    for (const slot of ["A", "B"] as const) this.#stop(slot);
  }

  unload(slot: DeckSlot): void {
    this.#loadVersions[slot] += 1;
    this.#stop(slot);
    const deck = this.#decks[slot];
    deck.buffer = null;
    deck.analysis = null;
    deck.waveform = [];
    deck.startedOffset = 0;
  }

  reset(): void {
    for (const timer of this.#transitionTimers) window.clearTimeout(timer);
    this.#transitionTimers.clear();
    for (const slot of ["A", "B"] as const) this.unload(slot);
  }

  async dispose(): Promise<void> {
    this.reset();
    await this.#context?.close();
    this.#context = null;
    this.#master = null;
    this.#safety = null;
    this.#limiter = null;
  }

  #ensureContext(): AudioContext {
    if (!this.#context) {
      this.#context = new AudioContext();
      this.#master = this.#context.createGain();
      this.#master.gain.value = this.#volume;
      this.#safety = this.#context.createGain();
      this.#safety.gain.value = dbToLinear(-3);
      this.#limiter = this.#context.createDynamicsCompressor();
      this.#limiter.threshold.value = -1;
      this.#limiter.knee.value = 0;
      this.#limiter.ratio.value = 20;
      this.#limiter.attack.value = 0.003;
      this.#limiter.release.value = 0.1;
      this.#safety.connect(this.#limiter).connect(this.#master).connect(this.#context.destination);
    }
    return this.#context;
  }

  #start(slot: DeckSlot, initialGain: number, when?: number, offsetSeconds = 0): void {
    const deck = this.#decks[slot];
    if (!deck.buffer) throw new Error("DECK_NOT_READY");
    this.#stop(slot);

    const context = this.#ensureContext();
    const source = context.createBufferSource();
    const normalization = context.createGain();
    const gain = context.createGain();
    source.buffer = deck.buffer;
    source.playbackRate.value = 1;
    gain.gain.value = initialGain;
    normalization.gain.value = dbToLinear(deck.analysis?.loudness.recommendedGainDb ?? 0);
    source.connect(normalization).connect(gain).connect(this.#safety!);
    const startAt = when ?? context.currentTime;
    source.start(startAt, Math.min(offsetSeconds, Math.max(0, deck.buffer.duration - 0.1)));
    source.addEventListener("ended", () => {
      if (deck.source === source) {
        source.disconnect();
        normalization.disconnect();
        gain.disconnect();
        deck.source = null;
        deck.gain = null;
        deck.normalization = null;
        deck.startedAt = null;
        deck.startedOffset = deck.buffer?.duration ?? 0;
      }
    });
    deck.source = source;
    deck.gain = gain;
    deck.normalization = normalization;
    deck.startedAt = startAt;
    deck.startedOffset = offsetSeconds;
  }

  #stop(slot: DeckSlot): void {
    const deck = this.#decks[slot];
    if (deck.source) {
      try {
        deck.source.stop();
      } catch {
        // A source can already have ended between UI events.
      }
      deck.source.disconnect();
    }
    deck.gain?.disconnect();
    deck.normalization?.disconnect();
    deck.source = null;
    deck.gain = null;
    deck.normalization = null;
    deck.startedAt = null;
    deck.startedOffset = 0;
  }
}

const DEFAULT_LOUDNESS: LoudnessAnalysis = {
  integratedLufs: -14,
  samplePeakDbfs: -1,
  recommendedGainDb: 0,
  targetLufs: -14,
  ceilingDbfs: -1,
  analysisVersion: "loudness-v2",
};
const DEFAULT_ANALYSIS: BeatAnalysis = { bpm: 120, firstBeatSeconds: 0, confidence: 0, loudness: DEFAULT_LOUDNESS };

function analyzeBeatGrid(buffer: AudioBuffer): BeatAnalysis {
  const samples = buffer.getChannelData(0);
  const blockSize = 1024;
  const blockRate = buffer.sampleRate / blockSize;
  const blockCount = Math.floor(samples.length / blockSize);
  const energy = new Float32Array(blockCount);

  for (let block = 0; block < blockCount; block += 1) {
    let sum = 0;
    const start = block * blockSize;
    for (let offset = 0; offset < blockSize; offset += 1) {
      const sample = samples[start + offset];
      sum += sample * sample;
    }
    energy[block] = Math.sqrt(sum / blockSize);
  }

  const onset = new Float32Array(blockCount);
  let onsetTotal = 0;
  for (let index = 1; index < blockCount; index += 1) {
    onset[index] = Math.max(0, energy[index] - energy[index - 1]);
    onsetTotal += onset[index];
  }

  let bestBpm = 120;
  let bestScore = -1;
  let scoreTotal = 0;
  for (let bpm = 70; bpm <= 180; bpm += 1) {
    const lag = Math.max(1, Math.round(blockRate * 60 / bpm));
    let score = 0;
    for (let index = lag; index < blockCount; index += 1) score += onset[index] * onset[index - lag];
    scoreTotal += score;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  const beatLag = Math.max(1, Math.round(blockRate * 60 / bestBpm));
  const searchBlocks = Math.min(blockCount, Math.round(blockRate * 20), beatLag * 16);
  let firstBeatBlock = 0;
  let strongestOnset = -1;
  for (let index = 0; index < searchBlocks; index += 1) {
    if (onset[index] > strongestOnset) {
      strongestOnset = onset[index];
      firstBeatBlock = index;
    }
  }

  const confidence = onsetTotal > 0 && scoreTotal > 0 ? clamp(bestScore * 111 / scoreTotal, 0, 1) : 0;
  return {
    bpm: bestBpm,
    firstBeatSeconds: firstBeatBlock / blockRate,
    confidence,
    loudness: DEFAULT_LOUDNESS,
  };
}

function analyzeLoudness(buffer: AudioBuffer): LoudnessAnalysis {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  return analyzeLoudnessSamples(channels, buffer.sampleRate);
}

export function analyzeLoudnessSamples(channels: Float32Array[], sampleRate: number): LoudnessAnalysis {
  const targetLufs = -14;
  const ceilingDbfs = -1;
  const length = Math.max(0, ...channels.map(({ length }) => length));
  const blockSize = Math.max(1, Math.round(sampleRate * 0.4));
  const blockEnergies: number[] = [];
  let samplePeak = 0;

  for (let start = 0; start < length; start += blockSize) {
    const end = Math.min(length, start + blockSize);
    let sumSquares = 0;
    let sampleCount = 0;
    for (const channel of channels) {
      const channelEnd = Math.min(end, channel.length);
      for (let index = start; index < channelEnd; index += 1) {
        const sample = channel[index];
        samplePeak = Math.max(samplePeak, Math.abs(sample));
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }
    if (sampleCount > 0) blockEnergies.push(sumSquares / sampleCount);
  }

  const aboveAbsoluteGate = blockEnergies.filter((energy) => energyToLufs(energy) >= -70);
  const absoluteMean = mean(aboveAbsoluteGate);
  const relativeGate = energyToLufs(absoluteMean) - 10;
  const gated = aboveAbsoluteGate.filter((energy) => energyToLufs(energy) >= Math.max(-70, relativeGate));
  const integratedLufs = roundTo(energyToLufs(mean(gated)), 2);
  const samplePeakDbfs = roundTo(samplePeak > 0 ? 20 * Math.log10(samplePeak) : -120, 2);
  const requestedGain = clamp(targetLufs - integratedLufs, -12, 8);

  return {
    integratedLufs,
    samplePeakDbfs,
    recommendedGainDb: roundTo(requestedGain, 2),
    targetLufs,
    ceilingDbfs,
    analysisVersion: "loudness-v2",
  };
}

function energyToLufs(energy: number): number {
  return energy > 0 ? -0.691 + 10 * Math.log10(energy) : -70;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function summarizeWaveform(samples: Float32Array, barCount: number): number[] {
  const samplesPerBar = Math.max(1, Math.floor(samples.length / barCount));
  const values: number[] = [];
  let maximum = 0;

  for (let bar = 0; bar < barCount; bar += 1) {
    const start = bar * samplesPerBar;
    const end = Math.min(samples.length, start + samplesPerBar);
    const stride = Math.max(1, Math.floor((end - start) / 256));
    let sum = 0;
    let count = 0;
    for (let index = start; index < end; index += stride) {
      const sample = samples[index];
      sum += sample * sample;
      count += 1;
    }
    const rms = count ? Math.sqrt(sum / count) : 0;
    maximum = Math.max(maximum, rms);
    values.push(rms);
  }

  return values.map((value) => maximum ? clamp(value / maximum, 0.04, 1) : 0.04);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
