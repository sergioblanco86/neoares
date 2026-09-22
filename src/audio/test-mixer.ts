import { equalPowerCrossfade } from "./transition-math";

export type MixerTestResult = {
  startedAt: number;
  durationSeconds: number;
  transitionSeconds: number;
};

export async function runTwoDeckAudioTest(): Promise<MixerTestResult> {
  const AudioContextConstructor = window.AudioContext;
  const context = new AudioContextConstructor();
  await context.resume();

  const master = context.createGain();
  master.gain.value = 0.12;
  master.connect(context.destination);

  const deckA = createToneDeck(context, 220, master);
  const deckB = createToneDeck(context, 329.63, master);
  const start = context.currentTime + 0.08;
  const transitionStart = start + 1.2;
  const transitionSeconds = 1.4;
  const stop = transitionStart + transitionSeconds + 0.4;

  deckA.gain.gain.setValueAtTime(1, start);
  deckB.gain.gain.setValueAtTime(0, start);
  deckA.oscillator.start(start);
  deckB.oscillator.start(start);

  for (const point of equalPowerCrossfade(24)) {
    const at = transitionStart + point.at * transitionSeconds;
    deckA.gain.gain.linearRampToValueAtTime(point.outgoing, at);
    deckB.gain.gain.linearRampToValueAtTime(point.incoming, at);
  }

  deckA.oscillator.stop(stop);
  deckB.oscillator.stop(stop);

  await new Promise<void>((resolve) => {
    deckB.oscillator.addEventListener("ended", () => resolve(), { once: true });
  });
  await context.close();

  return {
    startedAt: start,
    durationSeconds: stop - start,
    transitionSeconds,
  };
}

function createToneDeck(context: AudioContext, frequency: number, destination: AudioNode) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(destination);
  return { oscillator, gain };
}
