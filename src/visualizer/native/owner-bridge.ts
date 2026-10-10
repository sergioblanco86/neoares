import type { DualDeckMixer, MixerAnalysisTap } from "../../audio/dual-deck-mixer";
import workletUrl from "./pcm-worklet.js?url&no-inline";

const modules = new WeakMap<AudioContext, Promise<void>>();
export class OwnerAudioBridge {
  #tap: MixerAnalysisTap | null = null;
  #node: AudioWorkletNode | null = null;
  #disposed = false;
  #visible = true;
  constructor(readonly mixer: DualDeckMixer, readonly peer: MessagePort, readonly generation: string) {}
  async attach(): Promise<void> {
    const tap = this.mixer.createPostMasterAnalysisTap();
    this.#tap = tap;
    let loaded = modules.get(tap.context);
    if (!loaded) {
      loaded = tap.context.audioWorklet.addModule(workletUrl).catch(error => { modules.delete(tap.context); throw error; });
      modules.set(tap.context, loaded);
    }
    try {
      await loaded;
      if (this.#disposed) return;
      const node = new AudioWorkletNode(tap.context, "neoares-pcm", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: { generation: this.generation } });
      this.#node = node;
      node.port.postMessage({ type: "attach", peer: this.peer }, [this.peer]);
      node.port.postMessage({ type: "visible", visible: this.#visible });
      tap.node.connect(node); node.connect(tap.context.destination);
    } catch (error) { this.dispose(); throw error; }
  }
  setVisible(visible: boolean): void { this.#visible = visible; this.#node?.port.postMessage({ type: "visible", visible }); }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#node?.port.postMessage({ type: "dispose" });
    this.#node?.disconnect(); this.#node?.port.close(); this.#node = null;
    this.#tap?.release(); this.#tap = null;
    this.peer.close();
  }
}
