// Only this isolated proof channel, no production desktop API.
const { ipcRenderer } = require('electron');
ipcRenderer.on('proof:port', (event, metadata) => {
  window.postMessage({ type: 'proof:port', kind: metadata.kind }, window.location.origin === 'null' ? '*' : window.location.origin, event.ports);
});
