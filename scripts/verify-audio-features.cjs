// Only isolated fixtures and a temporary profile; never touches the real cache.
const { app, BrowserWindow, ipcMain } = require("electron");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { buildSync } = require("esbuild");
const output = mkdtempSync(path.join(tmpdir(), "neoares-audio-qa-"));
app.setPath("userData", path.join(output, "profile"));
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.whenReady().then(async () => {
  let server, window;
  const timeout = setTimeout(() => { console.error(`Timeout: ${output}`); void finish(1); }, 120000);
  async function finish(code) { clearTimeout(timeout); window?.destroy(); await server?.close(); app.exit(code); }
  try {
    const repositoryPath = path.join(output, "equalizer-repository.cjs");
    buildSync({ entryPoints: [path.join(__dirname, "../electron/equalizer-repository.ts")], bundle: true, platform: "node", format: "cjs", outfile: repositoryPath });
    const { EqualizerRepository } = require(repositoryPath);
    const repository = new EqualizerRepository(path.join(output, "profile", "data"));
    ipcMain.handle("audio-qa:load-equalizer", () => repository.load());
    ipcMain.handle("audio-qa:save-equalizer", (_event, settings) => repository.save(settings));
    window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, "audio-qa-preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    window.webContents.setAudioMuted(true);
    window.webContents.on("console-message", event => {
      console.log(`[renderer:${event.level}] ${event.message}`);
      if (event.message === "audio-qa: screenshot") void window.webContents.capturePage().then(image => writeFileSync(path.join(output, "equalizer.png"), image.toPNG()));
    });
    const { createServer } = await import("vite");
    server = await createServer({ configFile: path.join(__dirname, "../vite.config.ts"), server: { host: "127.0.0.1", port: 5175, strictPort: true, hmr: false } });
    await server.listen(); await window.loadURL("http://127.0.0.1:5175");
    const result = await window.webContents.executeJavaScript("import('/scripts/audio-features-probe.tsx').then(module => module.runAudioFeaturesProbe())");
    writeFileSync(path.join(output, "result.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, ...result })); await finish(0);
  } catch (error) { console.error(error); console.error(`Evidence: ${output}`); await finish(1); }
});
