import { useEffect, useRef, useState } from "react";
import { Power, RotateCcw, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useI18n } from "../i18n/i18n";
import { EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS } from "../shared/equalizer";
import { removePersonalPreset, savePersonalPreset, selectEqualizerPreset } from "./personal-presets";
import type { EqualizerController } from "./use-equalizer";

export function EqualizerWindow({ open, onClose, controller }: { open: boolean; onClose(): void; controller: EqualizerController }) {
  const { t } = useI18n();
  const { settings, status, update } = controller;
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose); close.current = onClose;
  const [position, setPosition] = useState(() => ({ x: Math.max(16, (window.innerWidth - 740) / 2), y: 120 }));
  const drag = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [name, setName] = useState("");
  const [validation, setValidation] = useState<"name" | "limit" | null>(null);
  const restartRequired = status === "restart-required";
  const unavailable = status === "loading" || status === "load-error" || restartRequired;
  const selectedPersonal = settings.personalPresets.find(preset => preset.id === settings.presetId);

  function bounded(x: number, y: number) {
    const rect = panel.current?.getBoundingClientRect();
    return { x: Math.max(12, Math.min(x, window.innerWidth - (rect?.width ?? 740) - 12)), y: Math.max(12, Math.min(y, window.innerHeight - (rect?.height ?? 460) - 12)) };
  }

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    panel.current?.focus();
    setPosition(value => bounded(value.x, value.y));
    const resize = () => setPosition(value => bounded(value.x, value.y));
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.fullscreenElement
        || !(event.target instanceof Node) || !panel.current?.contains(event.target)) return;
      event.preventDefault(); event.stopPropagation(); close.current();
    };
    window.addEventListener("resize", resize); window.addEventListener("keydown", escape);
    return () => {
      drag.current = null;
      window.removeEventListener("resize", resize); window.removeEventListener("keydown", escape);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const labels = { rock: "Rock", salsa: "Salsa", merengue: "Merengue", bass: t("equalizer.bass"), treble: t("equalizer.treble"), reggae: "Reggae", rap: "Rap", rnb: "R&B" };
  function save(): void {
    try { update(savePersonalPreset(settings, name)); setValidation(null); }
    catch (error) { setValidation(error instanceof Error && error.message === "EQUALIZER_PRESET_LIMIT" ? "limit" : "name"); }
  }

  return (
    <section aria-label={t("equalizer.title")} className="equalizer-window" ref={panel} role="region" style={{ left: position.x, top: position.y }} tabIndex={-1}>
      <header className="equalizer-titlebar"
        onPointerDown={event => {
          if (event.button !== 0 || (event.target as Element).closest("button") || window.matchMedia("(max-width: 999px), (max-height: 549px)").matches) return;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: position.x, top: position.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          const start = drag.current;
          if (start?.pointerId === event.pointerId) setPosition(bounded(start.left + event.clientX - start.x, start.top + event.clientY - start.y));
        }}
        onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onLostPointerCapture={() => { drag.current = null; }}>
        <div><SlidersHorizontal size={17} /><strong>{t("equalizer.title")}</strong><small>10 {t("equalizer.bands")}</small></div>
        <button aria-label={t("equalizer.close")} className="equalizer-icon" onClick={onClose} type="button"><X size={18} /></button>
      </header>
      <div className="equalizer-body">
        <div className="equalizer-toolbar">
          <button aria-pressed={settings.enabled} className={`equalizer-power${settings.enabled ? " enabled" : ""}`} disabled={unavailable} onClick={() => update({ ...settings, enabled: !settings.enabled })} type="button"><Power size={15} />{t(settings.enabled ? "equalizer.enabled" : "equalizer.bypassed")}</button>
          <label className="equalizer-presets"><span>{t("equalizer.preset")}</span>
            <select aria-label={t("equalizer.preset")} disabled={unavailable} onChange={event => {
              if (!event.target.value) return;
              const next = selectEqualizerPreset(settings, event.target.value);
              update(next); setName(next.personalPresets.find(preset => preset.id === next.presetId)?.name ?? ""); setValidation(null);
            }} value={settings.presetId ?? ""}>
              <option value="">{t("equalizer.custom")}</option>
              <optgroup label={t("equalizer.predefined")}>
                {EQUALIZER_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{labels[preset.id]}</option>)}
              </optgroup>
              {settings.personalPresets.length ? <optgroup label={t("equalizer.personal")}>{settings.personalPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</optgroup> : null}
            </select>
          </label>
          <button className="equalizer-flat" disabled={unavailable} onClick={() => update({ ...settings, gainsDb: EQUALIZER_FREQUENCIES.map(() => 0), preampDb: 0, presetId: null })} type="button"><RotateCcw size={14} />{t("equalizer.flat")}</button>
        </div>
        <fieldset className={`equalizer-sliders${settings.enabled ? "" : " bypassed"}`} disabled={unavailable}>
          <legend className="sr-only">{t("equalizer.bandControls")}</legend>
          <div className="equalizer-band preamp"><label htmlFor="eq-preamp"><span className="equalizer-preamp-full">{t("equalizer.preamp")}</span><abbr aria-hidden="true" className="equalizer-preamp-short" title={t("equalizer.preamp")}>Pre</abbr></label>
            <input aria-label={t("equalizer.preamp")} aria-orientation="vertical" aria-valuetext={`${settings.preampDb} dB`} id="eq-preamp" max={12} min={-12} onChange={event => update({ ...settings, enabled: true, preampDb: Number(event.target.value), presetId: null })} step={0.5} type="range" value={settings.preampDb} />
            <output htmlFor="eq-preamp">{db(settings.preampDb)}</output>
          </div>
          <div aria-hidden="true" className="equalizer-scale"><span>+12</span><span>0 dB</span><span>−12</span></div>
          {EQUALIZER_FREQUENCIES.map((frequency, index) => <div className="equalizer-band" key={frequency}>
            <label htmlFor={`eq-${frequency}`}>{frequency >= 1000 ? `${frequency / 1000}k` : frequency}</label>
            <input aria-label={`${frequency} Hz`} aria-orientation="vertical" aria-valuetext={`${settings.gainsDb[index]} dB`} id={`eq-${frequency}`} max={12} min={-12} onChange={event => update({ ...settings, enabled: true, gainsDb: settings.gainsDb.map((gain, band) => band === index ? Number(event.target.value) : gain), presetId: null })} step={0.5} type="range" value={settings.gainsDb[index]} />
            <output htmlFor={`eq-${frequency}`}>{db(settings.gainsDb[index])}</output>
          </div>)}
        </fieldset>
        <div className="equalizer-safety"><span>{t("equalizer.safety")}</span><strong>{t("equalizer.limiter")}</strong><small>{t("equalizer.safetyHint")}</small></div>
        <form className="equalizer-save" onSubmit={event => { event.preventDefault(); save(); }}>
          <label className="sr-only" htmlFor="eq-name">{t("equalizer.name")}</label>
          <input aria-invalid={validation === "name"} autoComplete="off" disabled={unavailable} id="eq-name" maxLength={60} onChange={event => { setName(event.target.value); setValidation(null); }} placeholder={t("equalizer.name")} value={name} />
          <button className="secondary-button" disabled={unavailable || !name.trim()} type="submit"><Save size={14} />{t("equalizer.save")}</button>
          {selectedPersonal ? <button aria-label={t("equalizer.delete")} className="equalizer-icon" disabled={unavailable} onClick={() => { update(removePersonalPreset(settings, selectedPersonal.id)); setName(""); }} title={t("equalizer.delete")} type="button"><Trash2 size={16} /></button> : null}
        </form>
        {validation ? <p className="equalizer-error" role="alert">{t(validation === "limit" ? "equalizer.limitError" : "equalizer.nameError")}</p> : null}
        <footer className="equalizer-footer" aria-live="polite">
          <div className="equalizer-save-status" data-reserve-label={t("equalizer.saved")}>
            <span className={status.includes("error") || restartRequired ? "equalizer-error" : ""}>{t(restartRequired ? "equalizer.restartRequired" : status === "load-error" ? "equalizer.loadError" : status === "error" ? "equalizer.saveError" : status === "saving" ? "equalizer.saving" : status === "loading" ? "equalizer.loading" : "equalizer.saved")}</span>
          </div>
          {status.includes("error") ? <button onClick={controller.retry} type="button">{t("equalizer.retry")}</button> : !restartRequired ? <small>{t("equalizer.overwriteHint")}</small> : null}
        </footer>
      </div>
    </section>
  );
}
function db(value: number): string { return `${value > 0 ? "+" : ""}${value.toFixed(1)}`; }
