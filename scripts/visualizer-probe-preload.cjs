const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("visualizerTestRuntime", {
  getWindowVisibility: () => ipcRenderer.invoke("runtime:get-window-visibility"),
  onWindowVisibility: listener => {
    const handler = (_event, visible) => listener(visible);
    ipcRenderer.on("runtime:window-visibility", handler);
    return () => ipcRenderer.removeListener("runtime:window-visibility", handler);
  },
});
