import { useEffect, useEffectEvent, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Download, Heart, Import, Lock, Maximize2, Minimize2, RotateCcw, Shuffle, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import type { DualDeckMixer } from "../../audio/dual-deck-mixer";
import type { VisualizerPresentation, VisualizerPresetDescriptor, VisualizerSettings, YouTubeSource } from "../../shared/contracts";
import { loadBundledPresetDefinitions } from "../butterchurn-renderer";
import { bundledPresetCatalog } from "../preset-catalog";
import { useI18n } from "../../i18n/i18n";
import { resolveVisualizerShortcut } from "../domain/visualizer-shortcuts";
import { PresetNavigator } from "../domain/preset-navigator";
import { VisualizerController } from "../visualizer-controller";

type PresetEntry = VisualizerPresetDescriptor & { definition?: unknown };
type Geometry = Pick<VisualizerPresentation, "x" | "y" | "width" | "height">;
type Props = { mixer: DualDeckMixer; open: boolean; onClose(): void; track: YouTubeSource | null; playing?: boolean; positionSeconds?: number; durationSeconds?: number };

export function VisualizerWindow({ mixer, open, onClose, track, playing = false, positionSeconds = 0, durationSeconds = 0 }: Props) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const windowRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<VisualizerSettings | null>(null);
  const entriesRef = useRef<PresetEntry[]>([]);
  const navigatorRef = useRef(new PresetNavigator());
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contextLossesRef = useRef(0);
  const [settings, setSettings] = useState<VisualizerSettings | null>(null);
  const [entries, setEntries] = useState<PresetEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [controller, setController] = useState<VisualizerController | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorDetail, setErrorDetail] = useState("");
  const [retryEpoch, setRetryEpoch] = useState(0);
  const [presetEpoch, setPresetEpoch] = useState(0);
  const [selectedAt, setSelectedAt] = useState(0);
  const [showLibrary, setShowLibrary] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [nativeVisible, setNativeVisible] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [geometry, setGeometry] = useState<Geometry>({ x: 28, y: 80, width: 800, height: 500 });
  const [presentationReady, setPresentationReady] = useState(false);
  const [search, setSearch] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);
  const hasData = settings !== null && entries.length > 0;

  function replaceEntries(next: PresetEntry[]): void {
    entriesRef.current = next; navigatorRef.current.setEntries(next); setEntries(next);
  }

  useEffect(() => {
    if (!open || settingsRef.current) return;
    let active = true;
    setStatus("loading");
    void (async () => {
      const api = window.desktop?.visualizer;
      if (!api) throw new Error("VISUALIZER_DESKTOP_REQUIRED");
      const [stored, imported, definitions, presentation] = await Promise.all([
        api.loadSettings(), api.listPresets(), loadBundledPresetDefinitions(), api.loadPresentation(),
      ]);
      if (!active) return;
      const favorites = new Set(stored.favoritePresetIds);
      const all = [...bundledPresetCatalog(definitions), ...imported].map(entry => ({ ...entry, favorite: entry.favorite || favorites.has(entry.id) }));
      replaceEntries(all);
      settingsRef.current = stored; setSettings(stored);
      setGeometry(boundGeometry(presentation)); setPresentationReady(true);
      const initial = all.find(entry => entry.id === stored.presetId && entry.compatibility === "ready")
        ?? all.find(entry => entry.id === "bundled-milkdrop2077-r002")
        ?? all.find(entry => entry.compatibility === "ready");
      if (!initial) throw new Error("VISUALIZER_NO_VALID_PRESET");
      setSelectedId(navigatorRef.current.select(initial.id, false));
    })().catch(error => { if (active) fail(error); });
    return () => { active = false; };
  }, [open, retryEpoch]);

  const runtimeError = useEffectEvent((error: unknown) => {
    if (error instanceof Error && error.message === "VISUALIZER_CONTEXT_LOST") contextLossesRef.current++;
    else if (selectedId && !(error instanceof Error && error.message === "VISUALIZER_INITIALIZATION_FAILED")) { recoverPreset(selectedId, error); return; }
    fail(error);
  });
  const restore = useEffectEvent(() => {
    if (contextLossesRef.current > 1 || !controller) return;
    void controller.restoreRenderer().then(() => setPresetEpoch(epoch => epoch + 1)).catch(fail);
  });
  useEffect(() => {
    if (!open || !hasData || !canvasRef.current || !settingsRef.current) return;
    const runtime = new VisualizerController(canvasRef.current, mixer, settingsRef.current, runtimeError, restore);
    setController(runtime);
    return () => { runtime.dispose(); setController(null); };
  }, [mixer, open, retryEpoch, hasData]);

  useEffect(() => { if (settings && controller) controller.configure(settings, playing, nativeVisible); }, [controller, settings, playing, nativeVisible]);

  useEffect(() => {
    if (!open || !window.desktop?.runtime) return;
    let active = true;
    const off = window.desktop.runtime.onWindowVisibility(visible => { if (active) setNativeVisible(visible); });
    void window.desktop.runtime.getWindowVisibility().then(visible => { if (active) setNativeVisible(visible); }).catch(() => undefined);
    return () => { active = false; off(); };
  }, [open]);

  useEffect(() => {
    if (!controller || !selectedId) return;
    let active = true;
    const id = selectedId;
    setStatus("loading"); setErrorDetail("");
    void (async () => {
      const preset = entriesRef.current.find(entry => entry.id === id);
      if (!preset) throw new Error("VISUALIZER_PRESET_NOT_FOUND");
      const definition = preset.definition ?? await window.desktop?.visualizer.loadPresetDefinition(id);
      if (!definition || !active) return;
      const current = settingsRef.current!;
      await controller.loadPreset(definition, current.transitionsEnabled ? current.transitionSeconds : 0);
      if (!active) return;
      setStatus("ready"); setSelectedAt(performance.now());
      void updateSettings({ presetId: id });
    })().catch(error => {
      if (!active) return;
      if (error instanceof Error && error.message === "VISUALIZER_INITIALIZATION_FAILED") fail(error);
      else recoverPreset(id, error);
    });
    return () => { active = false; };
  }, [controller, selectedId, presetEpoch]);

  const advanceAutomatically = useEffectEvent(() => navigate("random"));
  useEffect(() => {
    if (!open || !nativeVisible || status !== "ready" || !settings?.autoChange || settings.locked) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const remaining = Math.max(0, settings.changeIntervalSeconds * 1000 - (performance.now() - selectedAt));
      timer = setTimeout(advanceAutomatically, remaining);
    };
    schedule(); document.addEventListener("visibilitychange", schedule);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", schedule); };
  }, [open, nativeVisible, status, settings?.autoChange, settings?.locked, settings?.changeIntervalSeconds, selectedAt]);

  const keyHandler = useEffectEvent((event: KeyboardEvent) => {
    const command = resolveVisualizerShortcut({ key: event.key, repeat: event.repeat, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, editable: isEditable(event.target), modalOpen: document.querySelector('[role="dialog"]') !== null, fullscreen });
    if (!command) return;
    event.preventDefault(); event.stopPropagation(); activity();
    if (command === "CLOSE") close();
    if (command === "TOGGLE_FULLSCREEN") void toggleFullscreen();
    if (command === "RANDOM") navigate("random");
    if (command === "PREVIOUS") navigate("previous");
    if (command === "NEXT") navigate("next");
    if (command === "TOGGLE_LOCK") void updateSettings({ locked: !settings?.locked });
  });
  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => keyHandler(event);
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [open]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === windowRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  useEffect(() => {
    if (!open || !presentationReady || fullscreen) return;
    const timer = setTimeout(() => {
      void window.desktop?.visualizer.savePresentation({ schemaVersion: 1, ...geometry, updatedAt: new Date().toISOString() }).catch(() => setNotice(t("visualizer.saveFailed")));
    }, 200);
    return () => clearTimeout(timer);
  }, [open, geometry, fullscreen, presentationReady, t]);

  useEffect(() => {
    const element = windowRef.current;
    if (!open || !element || fullscreen) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setGeometry(current => current.width === Math.round(rect.width) && current.height === Math.round(rect.height) ? current : { ...current, width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    const resize = () => setGeometry(current => boundGeometry(current));
    observer.observe(element); window.addEventListener("resize", resize);
    return () => { observer.disconnect(); window.removeEventListener("resize", resize); };
  }, [open, fullscreen]);

  useEffect(() => () => { dragCleanupRef.current?.(); if (activityTimerRef.current) clearTimeout(activityTimerRef.current); }, []);

  if (!open) return null;
  const selected = entries.find(entry => entry.id === selectedId);
  const filtered = entries.filter(entry => (!favoritesOnly || entry.favorite) && `${entry.name} ${entry.author ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const progress = durationSeconds > 0 ? clamp(positionSeconds / durationSeconds, 0, 1) : 0;
  const visible = controlsVisible || showLibrary || status !== "ready" || !playing;
  return <section ref={windowRef} role="region" aria-label={t("visualizer.title")} className={`visualizer-window ${fullscreen ? "visualizer-fullscreen" : ""} ${visible ? "" : "visualizer-controls-hidden"}`} style={fullscreen ? undefined : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }} onPointerMove={activity} onFocusCapture={activity} onPointerDown={activity} onDoubleClick={event => { if (event.target === canvasRef.current) void toggleFullscreen(); }}>
    <header className="visualizer-titlebar" onPointerDown={startDrag}>
      <div><span className="visualizer-status-dot" data-status={status} /><strong>{t("visualizer.title")}</strong><small>{selected ? `${selected.author ?? "MilkDrop"} — ${selected.name}` : t("visualizer.loading")}</small></div>
      <div className="visualizer-title-actions">
        <button title={fullscreen ? t("visualizer.exitFullscreen") : t("visualizer.fullscreen")} aria-label={fullscreen ? t("visualizer.exitFullscreen") : t("visualizer.fullscreen")} onClick={() => void toggleFullscreen()} type="button">{fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        <button title={t("visualizer.close")} aria-label={t("visualizer.close")} onClick={close} type="button"><X size={18} /></button>
      </div>
    </header>
    <div className="visualizer-stage">
      <canvas aria-label={t("visualizer.canvas")} ref={canvasRef} />
      {status === "loading" ? <div className="visualizer-loading" role="status">{t("visualizer.loading")}</div> : null}
      {status === "error" ? <div className="visualizer-error" role="alert"><p>{t("visualizer.failed")}</p><small>{errorDetail}</small><div><button onClick={() => { contextLossesRef.current = 0; if (selectedId) navigatorRef.current.retry(selectedId); setRetryEpoch(epoch => epoch + 1); }} type="button">{t("visualizer.retry")}</button><button onClick={() => navigate("next")} type="button">{t("visualizer.next")}</button><button onClick={close} type="button">{t("visualizer.close")}</button></div></div> : null}
      {settings?.showTrackInfo && track ? <div className="visualizer-track">
        {track.thumbnailUrl ? <img alt="" src={track.thumbnailUrl} /> : null}<div><span>{t("visualizer.nowPlaying")}</span><strong>{track.title}</strong><small>{track.creator}</small><progress aria-label={t("visualizer.progress")} max={1} value={progress} /></div>
      </div> : null}
      {notice && !showLibrary ? <p className="visualizer-toast" role="status">{notice}</p> : null}
    </div>
    <footer className="visualizer-controls">
      <button title={t("visualizer.previous")} aria-label={t("visualizer.previous")} onClick={() => navigate("previous")} type="button"><ChevronLeft size={18} /></button>
      <button title={t("visualizer.random")} aria-label={t("visualizer.random")} onClick={() => navigate("random")} type="button"><Shuffle size={17} /></button>
      <button title={selected?.favorite ? t("visualizer.removeFavorite") : t("visualizer.addFavorite")} aria-label={selected?.favorite ? t("visualizer.removeFavorite") : t("visualizer.addFavorite")} aria-pressed={selected?.favorite ?? false} disabled={!selected} onClick={() => void toggleFavorite()} type="button"><Heart fill={selected?.favorite ? "currentColor" : "none"} size={17} /></button>
      <button title={t("visualizer.next")} aria-label={t("visualizer.next")} onClick={() => navigate("next")} type="button"><ChevronRight size={18} /></button>
      <span className="visualizer-divider" />
      <button title={t("visualizer.library")} aria-label={t("visualizer.library")} aria-expanded={showLibrary} onClick={() => setShowLibrary(value => !value)} type="button"><SlidersHorizontal size={17} /></button>
      <button title={settings?.locked ? t("visualizer.unlock") : t("visualizer.lock")} aria-label={settings?.locked ? t("visualizer.unlock") : t("visualizer.lock")} aria-pressed={settings?.locked ?? false} onClick={() => void updateSettings({ locked: !settings?.locked })} type="button"><Lock size={16} /></button>
    </footer>
    {showLibrary ? <aside className="visualizer-library" aria-label={t("visualizer.library")}>
      <div className="visualizer-library-header"><strong>{t("visualizer.presets")}</strong><button aria-label={t("visualizer.closeLibrary")} onClick={() => setShowLibrary(false)} type="button"><X size={16} /></button></div>
      <div className="visualizer-library-search"><input aria-label={t("visualizer.search")} placeholder={t("visualizer.search")} value={search} onChange={event => setSearch(event.target.value)} /><label><input type="checkbox" checked={favoritesOnly} onChange={event => setFavoritesOnly(event.target.checked)} />{t("visualizer.favorites")}</label></div>
      <div className="visualizer-preset-list">{filtered.map(entry => <div key={entry.id} className="visualizer-preset-row">
        <button className={entry.id === selectedId ? "active" : ""} title={entry.compatibilityError} disabled={entry.compatibility !== "ready"} onClick={() => select(entry.id)} type="button">
          <span>{entry.name}</span>
          <small>{entry.compatibility !== "ready" ? t("visualizer.incompatible") : entry.author ?? (entry.origin === "bundled" ? "MilkDrop" : t("visualizer.imported"))}</small>
          {entry.favorite ? <Star fill="currentColor" size={13} /> : null}
        </button>
        {entry.origin === "imported" ? <>
          {entry.compatibility !== "ready" ? <button className="visualizer-remove" title={entry.compatibilityError ?? t("visualizer.retry")} aria-label={`${t("visualizer.retry")} ${entry.name}`} onClick={() => void retryPreset(entry.id)} type="button"><RotateCcw size={14} /></button> : null}
          <button className="visualizer-remove" aria-label={`${t("visualizer.remove")} ${entry.name}`} title={t("visualizer.remove")} onClick={() => void removePreset(entry.id)} type="button"><Trash2 size={14} /></button>
        </> : null}
      </div>)}</div>
      {settings ? <fieldset className="visualizer-settings"><legend>{t("visualizer.settings")}</legend>
        <label><input type="checkbox" checked={settings.autoChange} onChange={event => void updateSettings({ autoChange: event.target.checked })} />{t("visualizer.autoChange")}</label>
        <label>{t("visualizer.interval")}<input type="number" min={10} max={600} value={settings.changeIntervalSeconds} onChange={event => { const value = Number(event.target.value); if (value >= 10 && value <= 600) void updateSettings({ changeIntervalSeconds: value }); }} /></label>
        <label><input type="checkbox" checked={settings.transitionsEnabled} onChange={event => void updateSettings({ transitionsEnabled: event.target.checked })} />{t("visualizer.transitions")}</label>
        <label>{t("visualizer.blend")}<input type="number" min={0} max={10} step={0.5} value={settings.transitionSeconds} onChange={event => { const value = Number(event.target.value); if (value >= 0 && value <= 10) void updateSettings({ transitionSeconds: value }); }} /></label>
        <label>{t("visualizer.quality")}<select value={settings.quality} onChange={event => void updateSettings({ quality: event.target.value as VisualizerSettings["quality"] })}>{(["auto", "low", "medium", "high"] as const).map(quality => <option key={quality} value={quality}>{t(`visualizer.quality.${quality}`)}</option>)}</select></label>
        <label><input type="checkbox" checked={settings.showTrackInfo} onChange={event => void updateSettings({ showTrackInfo: event.target.checked })} />{t("visualizer.trackInfo")}</label>
      </fieldset> : null}
      <div className="visualizer-import-actions"><button disabled={importing} onClick={() => void importPresets("files")} type="button"><Import size={15} />{t("visualizer.import")}</button><button disabled={importing} onClick={() => void importPresets("directory")} type="button"><Download size={15} />{t("visualizer.importDirectory")}</button></div>
      {notice ? <p className="visualizer-notice" role="status">{notice}</p> : null}
    </aside> : null}
  </section>;

  function fail(error: unknown): void {
    const code = error instanceof Error ? error.message.match(/VISUALIZER_[A-Z_]+/)?.[0] ?? "VISUALIZER_UNKNOWN_ERROR" : "VISUALIZER_UNKNOWN_ERROR";
    console.error("[visualizer]", code); setErrorDetail(code); setStatus("error");
  }
  function recoverPreset(id: string, error: unknown): void {
    navigatorRef.current.markFailed(id);
    console.error("[visualizer] preset-failed", id);
    try { setSelectedId(navigatorRef.current.next()); setNotice(t("visualizer.presetSkipped")); }
    catch { fail(new Error("VISUALIZER_NO_VALID_PRESET", { cause: error })); }
  }
  function select(id: string): void { try { setSelectedId(navigatorRef.current.select(id)); } catch (error) { fail(error); } }
  function navigate(direction: "next" | "previous" | "random"): void { try { setSelectedId(navigatorRef.current[direction]()); } catch (error) { fail(error); } }

  async function updateSettings(change: Partial<VisualizerSettings>): Promise<void> {
    if (!settingsRef.current) return;
    const next = { ...settingsRef.current, ...change, updatedAt: new Date().toISOString() };
    settingsRef.current = next; setSettings(next);
    try { await window.desktop?.visualizer.saveSettings(next); } catch { setNotice(t("visualizer.saveFailed")); }
  }

  async function toggleFavorite(): Promise<void> {
    if (!selected) return;
    const favorite = !selected.favorite;
    replaceEntries(entriesRef.current.map(entry => entry.id === selected.id ? { ...entry, favorite } : entry));
    const ids = new Set(settingsRef.current?.favoritePresetIds ?? []);
    if (favorite) ids.add(selected.id); else ids.delete(selected.id);
    await updateSettings({ favoritePresetIds: [...ids] });
    if (selected.origin === "imported") { try { await window.desktop?.visualizer.setFavorite(selected.id, favorite); } catch { setNotice(t("visualizer.saveFailed")); } }
  }

  async function importPresets(mode: "files" | "directory"): Promise<void> {
    setImporting(true);
    try {
      const result = await window.desktop?.visualizer.importPresets({ mode });
      const imported = await window.desktop?.visualizer.listPresets();
      if (imported) replaceEntries([...entriesRef.current.filter(entry => entry.origin === "bundled"), ...imported]);
      if (result) setNotice(t("visualizer.importResult", { imported: result.importedIds.length, skipped: result.skipped.length, incompatible: result.incompatible.length }) + (result.incompatible.length ? ` · ${result.incompatible.map(item => `${item.sourceName}: ${item.reason}`).join(" · ")}` : ""));
    } catch { setNotice(t("visualizer.importFailed")); } finally { setImporting(false); }
  }

  async function removePreset(id: string): Promise<void> {
    try {
      await window.desktop?.visualizer.removeImportedPreset(id);
      replaceEntries(entriesRef.current.filter(entry => entry.id !== id));
      if (selectedId === id) navigate("next");
      await updateSettings({ favoritePresetIds: (settingsRef.current?.favoritePresetIds ?? []).filter(value => value !== id) });
    } catch { setNotice(t("visualizer.removeFailed")); }
  }

  async function retryPreset(id: string): Promise<void> {
    try {
      const result = await window.desktop?.visualizer.retryImportedPreset(id);
      if (!result) return;
      replaceEntries(entriesRef.current.map(entry => entry.id === id ? result : entry));
      setNotice(result.compatibilityError ?? t("visualizer.retrySucceeded"));
      if (result.compatibility === "ready") navigatorRef.current.retry(id);
    } catch { setNotice(t("visualizer.importFailed")); }
  }

  async function toggleFullscreen(): Promise<void> {
    try { if (document.fullscreenElement === windowRef.current) await document.exitFullscreen(); else await windowRef.current?.requestFullscreen(); }
    catch { setNotice(t("visualizer.fullscreenFailed")); }
  }
  function close(): void { if (document.fullscreenElement === windowRef.current) void document.exitFullscreen().catch(() => undefined); onClose(); }
  function activity(): void {
    setControlsVisible(true);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    activityTimerRef.current = setTimeout(() => { if (!windowRef.current?.contains(document.activeElement)) setControlsVisible(false); }, 2500);
  }
  function startDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (fullscreen || event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.preventDefault(); dragCleanupRef.current?.();
    const initial = geometry, startX = event.clientX, startY = event.clientY;
    const move = (next: PointerEvent) => setGeometry(boundGeometry({ ...initial, x: initial.x + next.clientX - startX, y: initial.y + next.clientY - startY }));
    const end = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); dragCleanupRef.current = null; };
    dragCleanupRef.current = end;
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", end, { once: true }); window.addEventListener("pointercancel", end, { once: true });
  }
}

function boundGeometry(value: Geometry): Geometry {
  const width = clamp(value.width, Math.min(560, window.innerWidth - 16), Math.min(1920, window.innerWidth - 16));
  const height = clamp(value.height, Math.min(315, window.innerHeight - 16), Math.min(1200, window.innerHeight - 16));
  return { width, height, x: clamp(value.x, 8, Math.max(8, window.innerWidth - width - 8)), y: clamp(value.y, 8, Math.max(8, window.innerHeight - height - 8)) };
}
function isEditable(target: EventTarget | null): boolean { return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable=true]")); }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }
