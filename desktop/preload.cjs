// Ponte mínima entre a interface e o app de Windows. Nenhum acesso a Node é exposto.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('insaDesktop', {
  info: () => ipcRenderer.invoke('insa:info'),
  updateStatus: () => ipcRenderer.invoke('insa:update:status'),
  checkUpdates: () => ipcRenderer.invoke('insa:update:check'),
  installUpdate: () => ipcRenderer.invoke('insa:update:install'),
  getFeed: () => ipcRenderer.invoke('insa:update:feed:get'),
  setFeed: (f) => ipcRenderer.invoke('insa:update:feed:set', f),
  keysStatus: () => ipcRenderer.invoke('insa:keys:status'),
  setKey: (name, value) => ipcRenderer.invoke('insa:keys:set', name, value),
  openData: () => ipcRenderer.invoke('insa:data:open'),
  backup: () => ipcRenderer.invoke('insa:data:backup'),
  lock: () => ipcRenderer.invoke('insa:lock'),
  procurarMigracao: () => ipcRenderer.invoke('insa:migracao:procurar'),
  onVisivel: (cb) => { const h = (_e, v) => cb(v); ipcRenderer.on('insa:visivel', h); return () => ipcRenderer.removeListener('insa:visivel', h); },
  onUpdate: (cb) => { const h = (_e, s) => cb(s); ipcRenderer.on('insa:update', h); return () => ipcRenderer.removeListener('insa:update', h); },
});
