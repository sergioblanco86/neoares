import { PCM_BYTES, type AudioLevels } from "../../shared/native-visualizer";

export class RemoteAudioSource {
  readonly context: AudioContext;
  readonly ready: Promise<void>;
  readonly levels: AudioLevels = { timeByteArray: new Uint8Array(1024).fill(128), timeByteArrayL: new Uint8Array(1024).fill(128), timeByteArrayR: new Uint8Array(1024).fill(128) };
  #lastSequence = 0;
  #receivedAt = 0;
  #disposed = false;
  playing = false;
  constructor(readonly peer: MessagePort, readonly generation: string, readonly sampleRate: number) {
    this.context = new AudioContext({ sampleRate });
    this.ready = this.context.suspend();
    peer.onmessage = ({ data }) => {
      if (this.#disposed || data?.type !== "pcm" || data.generation !== generation || !(data.buffer instanceof ArrayBuffer) || data.buffer.byteLength !== PCM_BYTES) return;
      if (Number.isSafeInteger(data.sequence) && data.sequence > this.#lastSequence && data.sampleRate === sampleRate && Number.isFinite(data.producedAt) && Math.abs(Date.now() - data.producedAt) < 100) {
        this.#lastSequence = data.sequence; this.#receivedAt = performance.now();
        this.levels.timeByteArray.set(new Uint8Array(data.buffer, 0, 1024));
        this.levels.timeByteArrayL.set(new Uint8Array(data.buffer, 1024, 1024));
        this.levels.timeByteArrayR.set(new Uint8Array(data.buffer, 2048, 1024));
      }
      peer.postMessage({ type: "return", generation, buffer: data.buffer }, [data.buffer]);
    };
    peer.start();
  }
  sample(): AudioLevels {
    if (!this.playing || performance.now() - this.#receivedAt > 100) {
      this.levels.timeByteArray.fill(128); this.levels.timeByteArrayL.fill(128); this.levels.timeByteArrayR.fill(128);
    }
    return this.levels;
  }
  dispose(): void { if (this.#disposed) return; this.#disposed = true; this.peer.close(); void this.context.close(); }
}
