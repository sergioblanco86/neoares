import type { SupportedLocale, YouTubeSource } from "./contracts";

export type NativeVisualizerState = {
  track: YouTubeSource | null;
  playing: boolean;
  positionSeconds: number;
  durationSeconds: number;
  sampleRate: number;
  locale: SupportedLocale;
};
export type NativeVisualizerApi = {
  open(): Promise<void>;
  close(): Promise<void>;
  ready(): Promise<void>;
  publish(state: NativeVisualizerState): Promise<void>;
  toggleFullscreen(): Promise<boolean>;
  onState(listener: (state: NativeVisualizerState) => void): () => void;
  onClosed(listener: () => void): () => void;
  onCapture(listener: (visible: boolean) => void): () => void;
  onFullscreen(listener: (fullscreen: boolean) => void): () => void;
};
export type AudioLevels = { timeByteArray: Uint8Array; timeByteArrayL: Uint8Array; timeByteArrayR: Uint8Array };
export const PCM_BYTES = 3072;
export const PCM_SAMPLES = 1024;

export function isNativeVisualizerState(value: unknown): value is NativeVisualizerState {
  if (!value || typeof value !== "object") return false;
  const state = value as NativeVisualizerState;
  return typeof state.playing === "boolean" && (state.locale === "es" || state.locale === "en")
    && [state.positionSeconds, state.durationSeconds].every(n => Number.isFinite(n) && n >= 0)
    && Number.isFinite(state.sampleRate) && state.sampleRate >= 8000 && state.sampleRate <= 192000
    && (state.track === null || (typeof state.track?.id === "string" && typeof state.track?.title === "string" && typeof state.track?.creator === "string"));
}

export function isLocalPortEvent(event: MessageEvent): boolean {
  return event.source === window && (event.origin === location.origin || (location.protocol === "file:" && event.origin === "null"))
    && event.data?.type === "neoares:visualizer-port" && typeof event.data.generation === "string" && !!event.ports[0];
}
