import { useCallback, useEffect, useRef, useState } from "react";
import type { DualDeckMixer } from "../../audio/dual-deck-mixer";
import { isLocalPortEvent, type NativeVisualizerState } from "../../shared/native-visualizer";
import { OwnerAudioBridge } from "./owner-bridge";

export function useNativeVisualizer(mixer: DualDeckMixer, state: Omit<NativeVisualizerState, "sampleRate">, onError: (error: unknown) => void) {
  const [open, setOpen] = useState(false);
  const bridge = useRef<OwnerAudioBridge | null>(null);
  const captureVisible = useRef(true);
  const rateRef = useRef<number | null>(null);
  const latest = useRef(state); latest.current = state;
  const errorRef = useRef(onError); errorRef.current = onError;
  const publish = useCallback(() => {
    if (rateRef.current === null) {
      const tap = mixer.createPostMasterAnalysisTap();
      rateRef.current = tap.context.sampleRate; tap.release();
    }
    void window.desktop?.nativeVisualizer?.publish({ ...latest.current, sampleRate: rateRef.current }).catch(error => errorRef.current(error));
  }, [mixer]);
  useEffect(() => {
    const api = window.desktop?.nativeVisualizer;
    if (!api) return;
    const accept = (event: MessageEvent) => {
      if (!isLocalPortEvent(event) || event.data.role !== "owner") return;
      bridge.current?.dispose();
      const next = new OwnerAudioBridge(mixer, event.ports[0], event.data.generation);
      next.setVisible(captureVisible.current);
      bridge.current = next;
      void next.attach().then(() => publish()).catch(error => { void api.close(); errorRef.current(error); });
    };
    const offClosed = api.onClosed(() => { bridge.current?.dispose(); bridge.current = null; setOpen(false); });
    const offCapture = api.onCapture(visible => { captureVisible.current = visible; bridge.current?.setVisible(visible); });
    window.addEventListener("message", accept);
    return () => { window.removeEventListener("message", accept); offClosed(); offCapture(); bridge.current?.dispose(); bridge.current = null; void api.close().catch(() => undefined); };
  }, [mixer, publish]);
  useEffect(() => { if (open) publish(); }, [open, state.playing, state.track, state.positionSeconds, state.durationSeconds, state.locale, publish]);
  const show = useCallback(async (): Promise<void> => {
    try {
      if (!window.desktop?.nativeVisualizer) throw new Error("VISUALIZER_DESKTOP_REQUIRED");
      publish(); await window.desktop.nativeVisualizer.open(); setOpen(true);
    } catch (error) { errorRef.current(error); }
  }, [publish]);
  return { open, show, close: () => window.desktop?.nativeVisualizer?.close() };
}
