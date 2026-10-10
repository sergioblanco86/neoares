// Starts the actual main bundle and preload, not substitute IPC handlers.
// Default: isolated profile and IPC round-trip. --live: normal profile, read-only
// EQ check, opens the EQ panel and leaves NeoAres running for manual QA.
const { app } = require("electron");
const { mkdtempSync, mkdirSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const live = process.argv.includes("--live");
if (!live) {
  const profile = mkdtempSync(path.join(tmpdir(), "neoares-eq-startup-"));
  const userData = path.join(profile, "NeoAres");
  mkdirSync(userData);
  app.setPath("appData", profile);
  app.setPath("userData", userData);
  process.env.VITE_DEV_SERVER_URL = "data:text/html,<html><body>Equalizer IPC startup verification</body></html>";
}
const timeout = setTimeout(() => {
  console.error("equalizer-startup: timed out");
  if (!live) app.exit(1);
}, 30000);
app.on("browser-window-created", (_event, window) => {
  if (!live) window.once("show", () => window.hide());
  window.webContents.once("did-finish-load", async () => {
    try {
      const ipc = await window.webContents.executeJavaScript(`(async () => {
        const bridge = window.desktop?.equalizer;
        if (!bridge || typeof bridge.saveSettings !== 'function') throw new Error('Equalizer preload missing');
        const value = await bridge.loadSettings();
        if (value.schemaVersion !== 1 || value.gainsDb.length !== 10) throw new Error('Invalid EQ settings');
        if (${!live}) {
          const changed = { ...value, preampDb: -2, updatedAt: new Date().toISOString() };
          await bridge.saveSettings(changed);
          if ((await bridge.loadSettings()).preampDb !== -2) throw new Error('EQ round-trip failed');
        }
        return { realMainAndPreload: true, loadPassed: true, saveRoundTrip: ${!live} };
      })()`);
      let ui = null;
      if (live) {
        ui = await window.webContents.executeJavaScript(`(async () => {
          const wait = () => new Promise(resolve => setTimeout(resolve, 100));
          for (let n = 0; n < 250; n++) {
            const button = document.querySelector('button[aria-label="Open equalizer"], button[aria-label="Abrir ecualizador"]');
            if (button) { button.click(); break; }
            await wait();
          }
          for (let n = 0; n < 30; n++) {
            const panel = document.querySelector('.equalizer-window');
            const sliders = panel?.querySelectorAll('input[type="range"]');
            if (sliders?.length === 11 && [...sliders].every(slider => !slider.matches(':disabled'))) {
              return { enabledSliders: sliders.length, presetCount: panel.querySelectorAll('optgroup:first-of-type option').length, automaticCompensationRemoved: /No automatic volume compensation|Sin compensación automática de volumen/.test(panel.textContent), error: panel.querySelector('.equalizer-error')?.textContent ?? null };
            }
            await wait();
          }
          throw new Error('EQ panel did not become available');
        })()`);
        if (ui.error || ui.presetCount !== 8 || !ui.automaticCompensationRemoved) throw new Error("EQ UI verification failed");
      }
      console.log(JSON.stringify({ equalizerStartup: "passed", ...ipc, ui }));
      clearTimeout(timeout);
      if (!live) app.quit();
    } catch (cause) {
      console.error("equalizer-startup:", cause);
      clearTimeout(timeout);
      if (!live) app.exit(1);
    }
  });
});
require("../dist-electron/main.cjs");
