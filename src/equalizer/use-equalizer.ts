import { useEffect, useRef, useState } from "react";
import type { DualDeckMixer } from "../audio/dual-deck-mixer";
import type { EqualizerSettings } from "../shared/contracts";
import { assertEqualizerSettings, defaultEqualizerSettings } from "../shared/equalizer";
import { EQUALIZER_RESTART_REQUIRED, loadEqualizerSettings } from "./load-settings";

export function useEqualizer(mixer: DualDeckMixer) {
  const [settings, setSettings] = useState(defaultEqualizerSettings);
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "error" | "load-error" | "restart-required">("loading");
  const latest = useRef(settings), mounted = useRef(false), revision = useRef(0);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<number | null>(null);

  async function load(): Promise<void> {
    setStatus("loading");
    try {
      const value = await loadEqualizerSettings(window.desktop);
      if (!mounted.current) return;
      latest.current = value; setSettings(value); mixer.setEqualizer(value);
      setStatus("saved");
    } catch (cause) {
      if (mounted.current) setStatus(cause instanceof Error && cause.message === EQUALIZER_RESTART_REQUIRED ? "restart-required" : "load-error");
    }
  }

  function persist(): void {
    const snapshot = structuredClone(latest.current), version = revision.current;
    writes.current = writes.current.catch(() => undefined).then(() => window.desktop!.equalizer.saveSettings(snapshot));
    void writes.current.then(() => {
      if (mounted.current && version === revision.current) setStatus("saved");
    }, () => { if (mounted.current && version === revision.current) setStatus("error"); });
  }

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; persist(); }
    };
  }, [mixer]);

  function update(value: EqualizerSettings): void {
    if (status === "loading" || status === "load-error" || status === "restart-required") return;
    const next = { ...value, updatedAt: new Date().toISOString() };
    assertEqualizerSettings(next);
    revision.current++;
    latest.current = next; setSettings(next); mixer.setEqualizer(next);
    setStatus("saving");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; persist(); }, 200);
  }

  function retry(): void {
    if (status === "load-error" || status === "restart-required") { void load(); return; }
    setStatus("saving"); persist();
  }
  return { settings, status, update, retry };
}
export type EqualizerController = ReturnType<typeof useEqualizer>;
