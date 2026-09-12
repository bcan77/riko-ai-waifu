const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('waifuDesktop', {
  listWpkg: () => ipcRenderer.invoke('wpkg:list'),
  importWpkg: (p) => ipcRenderer.invoke('wpkg:import', p),
  pickWpkg: () => ipcRenderer.invoke('wpkg:dialog'),
  captureScreen: () => ipcRenderer.invoke('vision:capture'),
  systemStats: () => ipcRenderer.invoke('system:stats'),
  onDisplayMetrics: (cb) => {
    const h = (_e, v) => cb(v);
    ipcRenderer.on('display:metrics', h);
    return () => ipcRenderer.removeListener('display:metrics', h);
  },
  resetWindowBounds: () => ipcRenderer.invoke('window:resetBounds'),
  isDesktop: true,
});
