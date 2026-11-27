const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('velaDesktop', {
    isDesktop: true,
    platform: process.platform,
    version: '1.0.0',
    openExternal: (url) => ipcRenderer.send('open-external', url),
});
