// Instrument actual production classes for isolated QA, never shipped entry UI.
import { DualDeckMixer } from "../src/audio/dual-deck-mixer";
import { ButterchurnRenderer } from "../src/visualizer/butterchurn-renderer";
import { RemoteAudioSource } from "../src/visualizer/native/remote-audio";
import { OwnerAudioBridge } from "../src/visualizer/native/owner-bridge";

let mixer: DualDeckMixer | null = null;
let prepared = 0, frames = 0, rms = 0, consumed = 0, contextState = "", sampleRate = 0;
let bridges = 0;
const activeBridges = new WeakSet<OwnerAudioBridge>();
const attach = OwnerAudioBridge.prototype.attach, dispose = OwnerAudioBridge.prototype.dispose;
OwnerAudioBridge.prototype.attach = function() { if (!activeBridges.has(this)) { activeBridges.add(this); bridges++; } return attach.apply(this); };
OwnerAudioBridge.prototype.dispose = function() { if (activeBridges.delete(this)) bridges--; return dispose.apply(this); };
const prepare = DualDeckMixer.prototype.prepare;
DualDeckMixer.prototype.prepare = function(...args) { mixer = this; prepared++; return prepare.apply(this, args); };
const render = ButterchurnRenderer.prototype.render;
ButterchurnRenderer.prototype.render = function(...args) {
  const result = render.apply(this, args);
  if (args[1]) {
    frames++;
    rms = Math.sqrt(args[1].timeByteArray.reduce((sum, byte) => sum + ((byte - 128) / 128) ** 2, 0) / 1024);
    consumed = this.getAudioRms();
  }
  return result;
};
const sample = RemoteAudioSource.prototype.sample;
RemoteAudioSource.prototype.sample = function() { contextState = this.context.state; sampleRate = this.sampleRate; return sample.apply(this); };
export function inspect() { return { prepared, bridges, frames, rms, consumed, contextState, sampleRate, position: mixer?.getPlayerSnapshot("A").positionSeconds }; }
export function layout() {
  const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().toJSON();
  return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, player: rect(".now-playing"), controls: rect(".player-controls"), queue: rect(".queue-surface"), artwork: rect(".now-track-artwork"), track: rect(".now-track-copy"), topbar: rect(".topbar"), actions: rect(".autopilot-actions"), source: inspect() };
}
