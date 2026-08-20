const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { startServer } = require('./server.cjs')
require('dotenv').config({ path: app.isPackaged ? path.join(process.resourcesPath, '.env') : path.join(process.cwd(), '.env') })

let apiUrl = ''

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 680,
    backgroundColor: '#111318', titleBarStyle: 'hidden',
    icon: path.join(__dirname, '..', 'assets', 'voxora-icon.png'),
    titleBarOverlay: { color: '#111318', symbolColor: '#9ba3b4', height: 40 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  })
  const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
  if (!app.isPackaged) win.loadURL(devUrl)
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(async () => {
  const { session } = require('electron')
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(permission === 'media'))
  const server = await startServer(app.getPath('userData'))
  apiUrl = server.url
  ipcMain.handle('api-url', () => apiUrl)
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
