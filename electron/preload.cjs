const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  version: '0.1.0',
  getApiUrl: () => ipcRenderer.invoke('api-url')
})
