import { createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../src/i18n/i18n";
import { DualDeckMixer } from "../src/audio/dual-deck-mixer";
import { VisualizerWindow } from "../src/visualizer/components/VisualizerWindow";
import { VisualizerController } from "../src/visualizer/visualizer-controller";
import { ButterchurnRenderer } from "../src/visualizer/butterchurn-renderer";
import { loadBundledPresetDefinitions } from "../src/visualizer/butterchurn-renderer";
import "../src/styles/app.css";

export async function runVisualizerUiProbe() {
  document.getElementById("root")!.style.display = "none";
  const element = document.createElement("div"); document.body.append(element);
  const root = createRoot(element), mixer = new DualDeckMixer();
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  let settings = { schemaVersion: 1, enabled: true, presetId: "bundled-milkdrop2077-r002", autoChange: false, changeIntervalSeconds: 25, locked: false, transitionsEnabled: true, transitionSeconds: 0.2, quality: "low", showTrackInfo: true, favoritePresetIds: [], updatedAt: new Date().toISOString() };
  let geometry = { schemaVersion: 1, x: 30, y: 80, width: 960, height: 650, updatedAt: new Date().toISOString() };
  let taps = 0, releases = 0, loads = 0, renderCount = 0, activeController: VisualizerController | null = null;
  const createTap = mixer.createPostMasterAnalysisTap.bind(mixer);
  mixer.createPostMasterAnalysisTap = () => { taps++; const tap = createTap(), release = tap.release; tap.release = () => { releases++; release(); }; return tap; };
  const loadPreset = VisualizerController.prototype.loadPreset;
  VisualizerController.prototype.loadPreset = function(definition, seconds) { loads++; activeController = this; return loadPreset.call(this, definition, seconds); };
  const renderFrame = ButterchurnRenderer.prototype.render;
  ButterchurnRenderer.prototype.render = function(elapsed) { renderCount++; return renderFrame.call(this, elapsed); };
  window.desktop = {
    runtime: window.visualizerTestRuntime,
    appState: { load: async () => ({ schemaVersion: 2, languagePreference: "es", lastSelectedDjId: null, updatedAt: new Date().toISOString() }) },
    locale: { getPreferredLanguages: async () => ["es"], apply: async () => undefined },
    visualizer: { loadSettings: async () => settings, saveSettings: async next => { settings = next; }, loadPresentation: async () => geometry, savePresentation: async next => { geometry = next; }, listPresets: async () => [] },
  };
  function App() {
    const [open, setOpen] = useState(true);
    return <><button id="reopen-visualizer" onClick={() => setOpen(true)}>Open</button><VisualizerWindow open={open} onClose={() => setOpen(false)} mixer={mixer} track={{ title: "Audio verification · 120 BPM", creator: "NeoAres test signal", thumbnailUrl: "" }} playing={false} positionSeconds={42} durationSeconds={180} /></>;
  }
  root.render(createElement(I18nProvider, null, createElement(App)));
  const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await wait(50); } throw new Error("UI condition timed out"); };
  const click = label => {
    const button = element.querySelector(`button[aria-label="${label}"]`);
    if (!button) throw new Error(`Missing button: ${label}`); button.click();
  };
  const ready = () => element.querySelector('.visualizer-status-dot[data-status="ready"]');
  try {
    await until(ready);
    const frameStart = renderCount; await wait(1000);
    if (renderCount - frameStart > 18) throw new Error("Paused renderer exceeded 15 FPS budget");
    const initialCanvas = element.querySelector("canvas");
    click("Añadir a favoritos"); await wait(150);
    if (!settings.favoritePresetIds.length || loads !== 1 || taps !== 1) throw new Error("Favorite rebuilt the engine or was not saved");
    click("Bloquear preset"); await wait(100); click("Preset siguiente");
    await until(() => loads === 2 && ready());
    if (taps !== 1 || initialCanvas !== element.querySelector("canvas")) throw new Error("Preset navigation rebuilt the audio/canvas");
    click("Preset anterior"); await until(() => loads === 3 && ready());
    if (settings.presetId !== "bundled-milkdrop2077-r002") throw new Error("Previous did not use actual history");
    click("Biblioteca de presets"); await wait(200);
    const select = element.querySelector("select");
    select.value = "high"; select.dispatchEvent(new Event("change", { bubbles: true })); await wait(150);
    if (taps !== 1 || loads !== 3 || settings.quality !== "high") throw new Error("Quality changed the engine or was not persisted");
    console.log("ui: screenshot-ready"); await wait(500);
    click("Cerrar biblioteca");
    console.log("ui: fullscreen-ready"); await until(() => document.fullscreenElement !== null);
    console.log("ui: fullscreen detected"); await wait(150);
    if (!element.querySelector(".visualizer-fullscreen")) throw new Error("Fullscreen UI did not follow fullscreenchange");
    console.log("ui: escape-ready");
    await until(() => document.fullscreenElement === null);
    console.log("ui: Escape exited fullscreen");
    if (!element.querySelector("canvas")) throw new Error("Escape closed instead of exiting fullscreen");
    await wait(1200); // macOS finishes its native fullscreen exit animation later than the DOM event.
    await activeController!.restoreRenderer();
    const definitions = await loadBundledPresetDefinitions();
    await activeController!.loadPreset(definitions["MilkDrop2077.R002"], 0);
    if (taps !== 1 || releases !== 0) throw new Error("Renderer restoration recreated the audio tap");
    console.log("ui: hide-ready"); await wait(500);
    if (await window.visualizerTestRuntime.getWindowVisibility()) throw new Error("Native test window did not hide");
    const hiddenCount = renderCount; await wait(500);
    if (renderCount !== hiddenCount) throw new Error("Hidden renderer still requested frames");
    console.log("ui: show-ready"); await wait(250);
    if (renderCount === hiddenCount) throw new Error("Visible renderer did not resume");
    click("Cerrar visualizador"); await wait(150);
    if (element.querySelector("canvas") || releases !== 1) throw new Error("Close leaked the runtime");
    element.querySelector("#reopen-visualizer").click(); await until(() => taps === 2 && ready());
    if (loads !== 5) throw new Error("Reopen did not reload exactly once");
    console.log(`ui: verified favorites, lock/manual navigation, history, quality, close/reopen (${taps} taps, ${releases} released so far)`);
    return { taps, releasesBeforeUnmount: releases, loads, passed: true };
  } finally { root.unmount(); VisualizerController.prototype.loadPreset = loadPreset; ButterchurnRenderer.prototype.render = renderFrame; await mixer.dispose(); element.remove(); }
}
