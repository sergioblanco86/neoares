import { createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EqualizerGraph } from "../src/audio/equalizer";
import { DualDeckMixer } from "../src/audio/dual-deck-mixer";
import { AutonomousDjPanel } from "../src/components/AutonomousDjPanel";
import { createDefaultDj } from "../src/domain/default-djs";
import { I18nProvider } from "../src/i18n/i18n";
import { defaultEqualizerSettings } from "../src/shared/equalizer";
import { selectEqualizerPreset } from "../src/equalizer/personal-presets";
import type { EqualizerSettings, SessionSnapshot, YouTubeSource } from "../src/shared/contracts";
import "../src/styles/app.css";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
async function until(predicate: () => unknown, message: string) { for (let index = 0; index < 300; index++) { if (predicate()) return; await wait(30); } throw new Error(message); }

async function equalizerPcmProbe() {
  const base = defaultEqualizerSettings();
  async function render(settings: EqualizerSettings, frequency: number, limited = false) {
    const context = new OfflineAudioContext(1, 48000, 48000);
    const safety = context.createGain(), limiter = context.createDynamicsCompressor();
    safety.gain.value = 10 ** (-3 / 20);
    limiter.threshold.value = -1; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = 0.003; limiter.release.value = 0.1;
    if (limited) safety.connect(limiter).connect(context.destination);
    const graph = new EqualizerGraph(context, limited ? safety : context.destination);
    graph.configure(settings, true);
    const oscillator = context.createOscillator(), gain = context.createGain(); oscillator.frequency.value = frequency; gain.gain.value = 0.2;
    oscillator.connect(gain).connect(graph.input); oscillator.start();
    const buffer = await context.startRendering(), samples = buffer.getChannelData(0).slice(24000);
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
    check(Number.isFinite(rms) && samples.every(Number.isFinite), "Non-finite EQ PCM");
    return { rms, peak: Math.max(...samples.map(Math.abs)), limiterReductionDb: limited ? limiter.reduction : null };
  }
  const flat = await render(base, 63), bass = selectEqualizerPreset(base, "bass"), treble = selectEqualizerPreset(base, "treble");
  const low = await render(bass, 63), mid = await render(bass, 1000), high = await render(treble, 8000), trebleMid = await render(treble, 1000), bypass = await render({ ...bass, enabled: false }, 63);
  const extremeSettings = { ...base, enabled: true, gainsDb: Array(10).fill(12), preampDb: 12 };
  const extreme = await render(extremeSettings, 1000, true), extremeUnlimited = await render(extremeSettings, 1000);
  check(low.rms / mid.rms > 1.8, "Bass EQ does not change actual PCM spectrum");
  check(high.rms / trebleMid.rms > 1.4, "Treble EQ does not change actual PCM spectrum");
  check(Math.abs(flat.rms - bypass.rms) < 0.00001, "EQ bypass is not transparent");
  // DynamicsCompressor is not a brickwall/true-peak limiter. Check that it actually
  // reduces overloaded signal, without claiming arbitrary +24 dB boosts cannot clip.
  check(extreme.rms < extremeUnlimited.rms * 0.5 && extreme.limiterReductionDb! < -6, `Downstream limiter did not reduce the extreme fixture: ${JSON.stringify(extreme)}`);
  const individualBands = [];
  for (const index of [0, 9]) {
    const frequency = index === 0 ? 31 : 16000;
    const referenceBand = await render(base, frequency), referenceMid = await render(base, 1000);
    for (const gainDb of [-12, 12]) {
      const settings = { ...base, enabled: true, gainsDb: base.gainsDb.map((_, band) => band === index ? gainDb : 0) };
      const target = await render(settings, frequency), mid = await render(settings, 1000);
      const targetChangeDb = 20 * Math.log10(target.rms / referenceBand.rms), midChangeDb = 20 * Math.log10(mid.rms / referenceMid.rms);
      check(Math.abs(targetChangeDb - gainDb) < 0.15, `${frequency} Hz band did not apply its requested gain`);
      check(Math.abs(midChangeDb) < 0.1, `${frequency} Hz slider changed midrange/global volume`);
      // The same midrange-only signal remains stable through the safety/limiter path.
      const limitedMid = await render(settings, 1000, true), limitedReference = await render(base, 1000, true);
      const limitedMidChangeDb = 20 * Math.log10(limitedMid.rms / limitedReference.rms);
      check(Math.abs(limitedMidChangeDb) < 0.1, `${frequency} Hz slider caused broadband attenuation through the limiter`);
      individualBands.push({ frequency, gainDb, targetChangeDb, midChangeDb, limitedMidChangeDb });
    }
  }
  console.log("audio-qa: real EQ PCM passed");
  return { flat, low, mid, high, trebleMid, bypass, extreme, extremeUnlimited, individualBands };
}

export async function runAudioFeaturesProbe() {
  const pcm = await equalizerPcmProbe();
  document.getElementById("root")!.style.display = "none";
  // The integrated shell now hosts session actions in a portal. Keep this
  // isolated component probe from portaling into the hidden application's host.
  const shellToolbar = document.getElementById("session-toolbar");
  shellToolbar?.removeAttribute("id");
  const element = document.createElement("div"); element.style.padding = "24px"; document.body.append(element);
  let root = createRoot(element), activeMixer: DualDeckMixer | null = null;
  const originalPrepare = DualDeckMixer.prototype.prepare;
  DualDeckMixer.prototype.prepare = function(...args) { activeMixer = this; return originalPrepare.apply(this, args); };
  const dj = createDefaultDj({ id: "audio-qa", name: "QA Audio", description: "Synthetic audio fixtures · no network", prompt: "QA", genres: [] });
  const tracks: YouTubeSource[] = Array.from({ length: 20 }, (_, index) => ({ id: `qa${String(index).padStart(9, "0")}`, canonicalUrl: `https://www.youtube.com/watch?v=qa${String(index).padStart(9, "0")}`, title: `Tema QA ${index + 1}`, creator: `Artista QA ${index + 1}`, durationSeconds: 120, thumbnailUrl: null, requestedByUser: true }));
  let snapshot: SessionSnapshot | null = { schemaVersion: 1, sessionId: "audio-qa", djId: dj.id, djRevision: dj.revision, phase: "PLAYING", queue: tracks, currentIndex: 0, positionSeconds: 0, discoveryRound: 0, savedAt: new Date().toISOString(), recoverable: true };
  const audio = wav(), gates = new Map<string, () => void>(), calls: string[] = [], leases = new Map<string, string>();
  let releaseAll = false, released = 0, reads = 0, saveFailure = false, failSourceId: string | null = null;
  const realSettings = window.audioQaEqualizer;
  window.desktop = {
    platform: "darwin", connectivity: { check: async () => true },
    appState: { load: async () => ({ schemaVersion: 2, languagePreference: "es", lastSelectedDjId: null, updatedAt: new Date().toISOString() }), save: async () => {} },
    locale: { getPreferredLanguages: async () => ["es"], apply: async () => {} }, djs: { list: async () => [] },
    runtime: { setAudioActive: async () => {}, setMediaControlsActive: async () => {}, onMediaControl: () => () => {} },
    sessions: { loadActive: async () => snapshot, saveActive: async value => { snapshot = value; }, clearActive: async () => { snapshot = null; } },
    cache: { getLoudness: async () => null, saveLoudness: async () => {} },
    equalizer: { loadSettings: () => realSettings.loadSettings(), saveSettings: async settings => { if (saveFailure) throw new Error("simulated disk failure"); await realSettings.saveSettings(settings); } },
    sources: {
      searchMusicMany: async () => [[]], searchMany: async () => [[]], cancelPlayback: async () => 0,
      prepare: async source => {
        calls.push(source.id);
        if (source.id === failSourceId) throw new Error("simulated unavailable audio");
        if (source.id !== tracks[0].id && !releaseAll) await new Promise<void>(resolve => gates.set(source.id, resolve));
        const leaseId = crypto.randomUUID(); leases.set(leaseId, source.id); return { ...source, leaseId, byteLength: audio.length, format: "m4a" };
      },
      read: async id => { check(leases.has(id), "Read without a valid lease"); reads++; return audio; },
      release: async id => { check(leases.delete(id), "Duplicate or invalid release"); released++; },
    },
  };
  const render = () => root.render(createElement(StrictMode, null, createElement(I18nProvider, null, createElement(AutonomousDjPanel, { dj }))));
  const button = (label: string) => element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
  const clickText = (text: string) => { const target = [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes(text)); check(target, `Missing ${text}`); target!.click(); };
  const readyCount = () => element.querySelectorAll('[data-preparation="ready"]').length;
  const input = (selector: string, value: string) => {
    const node = element.querySelector<HTMLInputElement>(selector)!; check(node, `Missing ${selector}`);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value);
    node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true }));
  };
  try {
    render(); await until(() => element.textContent?.includes("Continuar"), "Restorable session missing"); clickText("Continuar");
    await until(() => gates.size === 2, "Expected two concurrent reserve downloads");
    check(button("Siguiente y mezclar").disabled, "Next unlocked before first track prepared");
    gates.get(tracks[1].id)!(); gates.delete(tracks[1].id);
    await until(() => !button("Siguiente y mezclar").disabled, "First prepared track did not unlock Next");
    check(readyCount() === 1, "Next waited for the entire reserve");
    button("Pausar").click(); await until(() => button("Continuar"), "Pause failed");
    releaseAll = true; for (const resolve of gates.values()) resolve(); gates.clear();
    await until(() => readyCount() === 4, "Four reserve tracks not prepared");
    check(button("Continuar"), "Finishing reserve preparation unpaused the music");
    button("Continuar").click(); await until(() => button("Pausar"), "Resume failed");
    check(calls.length === 5, "Prepared more than current plus four upcoming tracks");
    console.log("audio-qa: first-ready unlock and four-track reserve passed");

    // Move the third ready track to first through the actual queue menu.
    element.querySelectorAll<HTMLButtonElement>(".queue-menu-trigger")[2].click(); await wait(50);
    document.querySelectorAll<HTMLButtonElement>('.queue-floating-menu [role="menuitem"]')[1].click(); await wait(150);
    check(!button("Siguiente y mezclar").disabled && calls.length === 5, "Reorder re-downloaded or blocked an already prepared track");
    button("Abrir ecualizador").click(); await until(() => element.querySelector(".equalizer-window"), "EQ did not open");
    const eq = element.querySelector(".equalizer-window")!;
    check(eq.querySelectorAll('input[type="range"]').length === 11, "Expected ten bands and preamp");
    const select = eq.querySelector("select")!; check(select.querySelectorAll("optgroup:first-of-type option").length === 8, "Preset count is not eight");
    select.value = "bass"; select.dispatchEvent(new Event("change", { bubbles: true })); await wait(350);
    check((await realSettings.loadSettings()).presetId === "bass", "Preset was not atomically persisted through IPC");
    input("#eq-63", "7.5"); input("#eq-name", "Mi QA"); await wait(80);
    eq.querySelector<HTMLFormElement>("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await wait(350); const saved = await realSettings.loadSettings();
    check(saved.personalPresets.length === 1 && saved.personalPresets[0].gainsDb[1] === 7.5, "Personal EQ save failed");
    console.log("audio-qa: screenshot"); await wait(300);
    saveFailure = true; input("#eq-preamp", "-3"); await until(() => eq.textContent?.includes("no guardados"), "Save failure was hidden");
    saveFailure = false; clickText("Reintentar"); await until(() => eq.textContent?.includes("Ajustes guardados"), "Save retry failed");
    check((await realSettings.loadSettings()).preampDb === -3, "Retry did not persist applied curve");
    button("Cerrar ecualizador").click(); await wait(50); check(!element.querySelector(".equalizer-window"), "EQ did not close");
    button("Abrir ecualizador").click(); await wait(50); check(element.querySelector<HTMLInputElement>("#eq-preamp")!.value === "-3", "Closing EQ lost its state");
    element.querySelector<HTMLElement>(".equalizer-window")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await until(() => !element.querySelector(".equalizer-window"), "EQ Escape close failed");
    console.log("audio-qa: EQ UI, persistence and save failure/retry passed");

    const skipStarted = performance.now();
    for (let index = 0; index < 3; index++) {
      const before = element.querySelector(".now-track-copy strong")?.textContent;
      button("Siguiente y mezclar").click();
      await until(() => element.querySelector(".now-track-copy strong")?.textContent !== before && !button("Siguiente y mezclar").disabled, "Rapid next did not use reserve");
    }
    const skipMs = performance.now() - skipStarted;
    check(skipMs < 5000, "Rapid skips waited for each six-second crossfade");
    await until(() => readyCount() === 4, "Reserve not refilled after rapid skips");
    await wait(6400); check(activeMixer!.getPlayerSnapshot("B").playing, "An old crossfade timer stopped the reused deck");
    console.log("audio-qa: rapid skips, timer safety and reserve refill passed");

    // Stop with downloads pending, then let those stale operations complete.
    releaseAll = false; button("Siguiente y mezclar").click();
    await until(() => gates.size > 0, "No pending preparation to cancel"); clickText("Terminar");
    await until(() => element.querySelectorAll(".auto-queue-item").length === 0, "Stop did not clear queue");
    const readsAtStop = reads; for (const resolve of gates.values()) resolve(); gates.clear(); await wait(350);
    check(reads === readsAtStop && leases.size === 0, "Stale completion decoded audio or leaked a lease after stop");

    snapshot = { schemaVersion: 1, sessionId: "audio-qa-failure", djId: dj.id, djRevision: dj.revision, phase: "PLAYING", queue: [...tracks], currentIndex: 0, positionSeconds: 0, discoveryRound: 0, savedAt: new Date().toISOString(), recoverable: true };
    root.unmount(); await wait(50); root = createRoot(element); render();
    await until(() => button("Abrir ecualizador"), "Remount failed"); button("Abrir ecualizador").click();
    await until(() => element.querySelector<HTMLInputElement>("#eq-preamp")?.value === "-3", "EQ did not restore after renderer remount");
    button("Cerrar ecualizador").click();
    releaseAll = true; failSourceId = tracks[1].id;
    await until(() => element.textContent?.includes("Continuar"), "Restorable failure fixture missing"); clickText("Continuar");
    await until(() => readyCount() === 4, "A failed source prevented reserve recovery");
    check(![...element.querySelectorAll(".queue-track-copy strong")].some(node => node.textContent === tracks[1].title), "Failed source was not removed");
    check(element.querySelector(".now-track-copy strong")?.textContent === tracks[0].title && !button("Siguiente y mezclar").disabled, "Preparation failure interrupted current music or Next");
    clickText("Terminar"); await wait(100);
    console.log("audio-qa: stop invalidation and persisted EQ restore passed");

    // Reproduce an updated renderer/preload calling an older running main process.
    const workingLoad = window.desktop!.equalizer.loadSettings;
    window.desktop!.equalizer.loadSettings = async () => { throw new Error("Error invoking remote method 'equalizer-settings:load': Error: No handler registered for 'equalizer-settings:load'"); };
    root.unmount(); await wait(50); root = createRoot(element); render();
    await until(() => button("Abrir ecualizador"), "Restart-required fixture failed to mount"); button("Abrir ecualizador").click();
    await until(() => element.textContent?.includes("Cierra y vuelve a abrir NeoAres"), "Old main process was mistaken for corrupt settings");
    check(element.querySelector<HTMLInputElement>("#eq-preamp")!.matches(":disabled"), "Unavailable EQ allowed edits");
    check(![...element.querySelectorAll(".equalizer-footer button")].length, "Retry offered for a required process restart");

    // A real storage failure must remain retryable and must not overwrite saved EQ.
    window.desktop!.equalizer.loadSettings = async () => { throw new Error("EQUALIZER_SETTINGS_UNREADABLE"); };
    root.unmount(); await wait(50); root = createRoot(element); render();
    await until(() => button("Abrir ecualizador"), "Storage failure fixture failed to mount"); button("Abrir ecualizador").click();
    await until(() => element.textContent?.includes("No se pudo cargar la ecualización"), "Storage failure hidden");
    check((await realSettings.loadSettings()).preampDb === -3, "Failed load overwrote saved EQ");
    window.desktop!.equalizer.loadSettings = workingLoad; clickText("Reintentar");
    await until(() => element.querySelector<HTMLInputElement>("#eq-preamp")?.value === "-3" && !element.querySelector<HTMLInputElement>("#eq-preamp")!.matches(":disabled"), "Load retry did not restore saved EQ");
    console.log("audio-qa: old main restart guidance and storage load retry passed");
    return { passed: true, pcm, preparedCalls: calls.length, releasedLeases: released, remainingLeases: leases.size, threeRapidSkipsMs: Math.round(skipMs), personalPresets: (await realSettings.loadSettings()).personalPresets.length, preparationFailureRecovered: true, equalizerRestartGuidance: true, equalizerLoadRetry: true };
  } finally { root.unmount(); DualDeckMixer.prototype.prepare = originalPrepare; element.remove(); if (shellToolbar) shellToolbar.id = "session-toolbar"; }
}

function wav(): Uint8Array {
  const rate = 8000, length = rate * 120, bytes = new Uint8Array(44 + length * 2), view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); ascii(8, "WAVE"); ascii(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, length * 2, true);
  for (let index = 0; index < length; index++) view.setInt16(44 + index * 2, Math.round(Math.sin(index / rate * 2 * Math.PI * 125) * 5000), true);
  return bytes;
}
