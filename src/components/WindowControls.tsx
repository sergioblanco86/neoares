import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { useI18n } from "../i18n/i18n";
import { isWindowState, type WindowCommand, type WindowState } from "../shared/window-controls";

export function WindowControls() {
  const { t } = useI18n();
  const api = window.desktop?.windowControls;
  const [state, setState] = useState<WindowState | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!api) return;
    let active = true, receivedEvent = false;
    const off = api.onState(value => {
      if (active && isWindowState(value)) { receivedEvent = true; setState(value); }
    });
    void api.getState().then(value => {
      if (active && !receivedEvent && isWindowState(value)) setState(value);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; off(); };
  }, [api]);
  if (!api) return null;
  async function command(value: WindowCommand) {
    if (busy.current) return;
    busy.current = true;
    setFailed(false); setPending(true);
    try { await api!.command(value); }
    catch { if (mounted.current) setFailed(true); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  const restore = state?.maximized || state?.fullscreen;
  const maximizeLabel = t(state?.fullscreen ? "window.exitFullscreen" : restore ? "window.restore" : "window.maximize");
  return <div className="window-controls" role="group" aria-label={t("window.controls")} data-focused={state?.focused ?? true} data-maximized={state?.maximized ?? false} data-fullscreen={state?.fullscreen ?? false}>
    {failed ? <span className="window-control-error" role="alert">{t("window.failed")}</span> : null}
    <button className="window-minimize" aria-label={t("window.minimize")} title={t("window.minimize")} disabled={pending} onClick={() => void command("minimize")} type="button"><Minus size={15} /></button>
    <button className="window-maximize" aria-label={maximizeLabel} title={maximizeLabel} disabled={pending || !state} onClick={() => void command("toggleMaximize")} type="button">{restore ? <Copy size={14} /> : <Square size={13} />}</button>
    <button className="window-close" aria-label={t("window.close")} title={t("window.close")} disabled={pending} onClick={() => void command("close")} type="button"><X size={17} /></button>
  </div>;
}

/** Outside App's dialogs/inert content: window actions remain reachable offline. */
export function PlayerWindowFrame({ children }: { children: ReactNode }) {
  const available = !!window.desktop?.windowControls;
  return <div className={`player-window-frame${available ? " has-window-chrome" : ""}`}>
    {available ? <header className="player-window-chrome"><span>NeoAres</span><WindowControls /></header> : null}
    <div className="player-window-content">{children}</div>
  </div>;
}
