// Analysis branch only: output is always zero, never duplicate audible audio.
class NeoAresPcm extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.generation = options.processorOptions.generation;
    this.left = new Float32Array(1024);
    this.right = new Float32Array(1024);
    this.cursor = 0; this.lastEmit = 0; this.sequence = 0;
    this.active = true; this.visible = true; this.peer = null;
    this.pool = Array.from({ length: 3 }, () => new ArrayBuffer(3072));
    this.port.onmessage = ({ data }) => {
      if (data.type === 'attach') {
        this.peer = data.peer;
        this.peer.onmessage = ({ data: reply }) => {
          if (reply.type === 'return' && reply.generation === this.generation && reply.buffer instanceof ArrayBuffer && reply.buffer.byteLength === 3072 && this.pool.length < 3) this.pool.push(reply.buffer);
        };
        this.peer.start();
      }
      if (data.type === 'visible') this.visible = data.visible === true;
      if (data.type === 'dispose') { this.peer?.close(); this.peer = null; this.pool = []; this.active = false; }
    };
  }
  process(inputs) {
    if (!this.active) return false;
    const left = inputs[0]?.[0], right = inputs[0]?.[1] ?? left;
    for (let i = 0; i < 128; i++) {
      this.left[this.cursor] = left?.[i] ?? 0; this.right[this.cursor] = right?.[i] ?? 0;
      this.cursor = (this.cursor + 1) % 1024;
    }
    if (this.peer && this.visible && currentFrame - this.lastEmit >= sampleRate / 60) {
      this.lastEmit = currentFrame;
      if (!this.pool.length) return true;
      const buffer = this.pool.pop();
      const mono = new Uint8Array(buffer, 0, 1024), l = new Uint8Array(buffer, 1024, 1024), r = new Uint8Array(buffer, 2048, 1024);
      const byte = value => Math.max(0, Math.min(255, Math.floor((value + 1) * 128)));
      for (let i = 0; i < 1024; i++) {
        const j = (this.cursor + i) % 1024;
        l[i] = byte(this.left[j]); r[i] = byte(this.right[j]); mono[i] = byte((this.left[j] + this.right[j]) * .5);
      }
      this.peer.postMessage({ type: 'pcm', generation: this.generation, sequence: ++this.sequence, producedAt: Date.now(), sampleRate, buffer }, [buffer]);
    }
    return true;
  }
}
registerProcessor('neoares-pcm', NeoAresPcm);
