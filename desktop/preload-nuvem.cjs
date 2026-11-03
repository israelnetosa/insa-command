// Ponte mínima para a página da nuvem: só atualizações do app e voltar ao modo local.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('insaShell', {
  updateStatus: () => ipcRenderer.invoke('insa:update:status'),
  checkUpdates: () => ipcRenderer.invoke('insa:update:check'),
  installUpdate: () => ipcRenderer.invoke('insa:update:install'),
  sairDaNuvem: () => ipcRenderer.invoke('insa:nuvem:sair'),
  onUpdate: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on('insa:update', h); return () => ipcRenderer.removeListener('insa:update', h); },
  onVisivel: (cb) => { const h = (_e, v) => cb(v); ipcRenderer.on('insa:visivel', h); return () => ipcRenderer.removeListener('insa:visivel', h); },
});
