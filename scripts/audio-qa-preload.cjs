const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("audioQaEqualizer", {
  loadSettings: () => ipcRenderer.invoke("audio-qa:load-equalizer"),
  saveSettings: settings => ipcRenderer.invoke("audio-qa:save-equalizer", settings),
});
