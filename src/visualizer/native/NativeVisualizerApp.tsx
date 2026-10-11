import { useEffect, useRef, useState } from "react";
import { isLocalPortEvent, isNativeVisualizerState, type NativeVisualizerState } from "../../shared/native-visualizer";
import { VisualizerWindow } from "../components/VisualizerWindow";
import { VisualizerErrorBoundary } from "../components/VisualizerErrorBoundary";
import { useI18n } from "../../i18n/i18n";
import { RemoteAudioSource } from "./remote-audio";
import { WindowControls } from "../../components/WindowControls";

export function NativeVisualizerApp() {
  const { t } = useI18n();
  const [state, setState] = useState<NativeVisualizerState | null>(null);
  const [connection, setConnection] = useState<{ peer: MessagePort; generation: string } | null>(null);
  const [source, setSource] = useState<RemoteAudioSource | null>(null);
  const requested = useRef(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const port = (event: MessageEvent) => {
      if (isLocalPortEvent(event) && event.data.role === "consumer") setConnection({ peer: event.ports[0], generation: event.data.generation });
    };
    window.addEventListener("message", port);
    const off = window.desktop!.nativeVisualizer!.onState(value => { if (isNativeVisualizerState(value)) setState(value); });
    if (!requested.current) { requested.current = true; void window.desktop!.nativeVisualizer!.ready().catch(() => setFailed(true)); }
    return () => { window.removeEventListener("message", port); off(); };
  }, []);
  const rate = state?.sampleRate;
  useEffect(() => {
    if (!connection || !rate) return;
    let next: RemoteAudioSource;
    try { next = new RemoteAudioSource(connection.peer, connection.generation, rate); }
    catch { connection.peer.close(); setFailed(true); return; }
    setSource(next);
    return () => { next.dispose(); setSource(null); };
  }, [connection, rate]);
  const close = () => { void window.desktop!.nativeVisualizer!.close(); };
  const waitChrome = <header className="native-visualizer-wait-chrome"><span>NeoAres</span><WindowControls /></header>;
  if (failed) return <>{waitChrome}<div className="native-visualizer-wait" role="alert">{t("visualizer.failed")}<button onClick={() => { setFailed(false); void window.desktop!.nativeVisualizer!.ready().catch(() => setFailed(true)); }} type="button">{t("visualizer.retry")}</button><button onClick={close} type="button">{t("visualizer.close")}</button></div></>;
  if (!state || !source) return <>{waitChrome}<div className="native-visualizer-wait" role="status">{t("visualizer.loading")}<button onClick={close} type="button">{t("visualizer.close")}</button></div></>;
  return <VisualizerErrorBoundary open onClose={close} failedLabel={t("visualizer.failed")} retryLabel={t("visualizer.retry")} closeLabel={t("visualizer.close")}><VisualizerWindow native mixer={source} open track={state.track} playing={state.playing} positionSeconds={state.positionSeconds} durationSeconds={state.durationSeconds} onClose={close} /></VisualizerErrorBoundary>;
}
