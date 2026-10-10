// Isolated Electron profile: never opens or edits the user's DJ library.
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const output = mkdtempSync(path.join(tmpdir(), "neoares-visualizer-proof-"));
app.setPath("userData", path.join(output, "profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.whenReady().then(async () => {
  let viteServer;
  const window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, "visualizer-probe-preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  ipcMain.handle("runtime:get-window-visibility", () => window.isVisible() && !window.isMinimized());
  for (const event of ["show", "hide", "minimize", "restore"]) window.on(event, () => window.webContents.send("runtime:window-visibility", window.isVisible() && !window.isMinimized()));
  if (process.env.VISUALIZER_UI_TEST === "1") window.showInactive();
  window.webContents.setAudioMuted(true);
  window.webContents.on("console-message", event => {
    console.log(`[renderer:${event.level}] ${event.message}`);
    if (event.message === "ui: screenshot-ready") window.webContents.capturePage().then(image => writeFileSync(path.join(output, "window.png"), image.toPNG()));
    if (event.message === "ui: hide-ready") window.hide();
    if (event.message === "ui: show-ready") window.showInactive();
    if (event.message === "ui: escape-ready") setTimeout(() => {
      window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
    }, 1000);
    if (event.message === "ui: fullscreen-ready") {
      window.showInactive();
      window.focus();
      window.webContents.executeJavaScript(`document.querySelector('.visualizer-window').requestFullscreen().then(() => console.log('ui: fullscreen entered'), e => console.error('ui: fullscreen rejected '+e))`, true).catch(console.error);
    }
  });
  async function finish(code) { clearTimeout(timeout); window.destroy(); await viteServer?.close(); app.exit(code); }
  const timeout = setTimeout(() => { console.error(`Timed out. Evidence: ${output}`); void finish(1); }, 90000);
  try {
    let url = process.env.VISUALIZER_TEST_URL;
    if (!url) {
      const { createServer } = await import("vite");
      viteServer = await createServer({ configFile: path.join(__dirname, "../vite.config.ts"), server: { host: "127.0.0.1", port: 5174, strictPort: true, hmr: false } });
      await viteServer.listen(); url = "http://127.0.0.1:5174";
    }
    await window.loadURL(url);
    console.log("Probe page loaded");
    if (process.env.VISUALIZER_UI_TEST === "1") {
      const result = await window.webContents.executeJavaScript(`import('/scripts/visualizer-ui-probe.tsx').then(m => m.runVisualizerUiProbe())`);
      console.log(JSON.stringify({ output, ...result })); await finish(0); return;
    }
    const result = await window.webContents.executeJavaScript(`import('/scripts/visualizer-probe.ts').then(m => m.runVisualizerProbe())`);
    writeFileSync(path.join(output, "presets.png"), Buffer.from(result.image.split(",")[1], "base64"));
    delete result.image;
    writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
    const mean = (samples, key) => samples.reduce((sum, value) => sum + value[key], 0) / samples.length;
    const audible = mean(result.audible, "rms"), muted = mean(result.muted, "rms");
    if (audible < 0.01 || muted > 0.002 || muted > audible * 0.02) throw new Error(`PCM routing failed: audible=${audible}, muted=${muted}`);
    if (mean(result.audible, "bass") <= mean(result.audible, "mids")) throw new Error("Bass signal not detected");
    if (mean(result.afterFade, "mids") <= mean(result.afterFade, "bass")) throw new Error("Deck B not detected after crossfade");
    if (result.renderErrors.length) throw new Error(`Preset runtime failures: ${JSON.stringify(result.renderErrors)}`);
    for (const [index, snapshot] of result.snapshots.entries()) {
      if (mean(snapshot.pixels.map(value => ({ value })), "value") < 2) throw new Error(`Black preset: ${snapshot.id}`);
      for (const previous of result.snapshots.slice(0, index)) {
        const difference = snapshot.pixels.reduce((sum, value, i) => sum + Math.abs(value - previous.pixels[i]), 0) / snapshot.pixels.length;
        if (difference < 3) throw new Error(`Indistinguishable presets: ${snapshot.id}, ${previous.id}, difference=${difference}`);
      }
    }
    console.log(JSON.stringify({ output, audibleRms: audible, mutedRms: muted, presets: result.snapshots.length, passed: true }));
    await finish(0);
  } catch (error) { console.error(error); console.error(`Evidence: ${output}`); await finish(1); }
});
