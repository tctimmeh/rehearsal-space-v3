import { join } from 'node:path'
import { app, BrowserWindow, shell } from 'electron'

import { registerIpcHandlers } from './ipc'
import { captureAndExit, requestedCapturePath } from './devCapture'

/**
 * Everything is drawn larger than the mockup's natural size. This is a tool you
 * read from a music stand with an instrument in your hands, not from a desk.
 */
const UI_SCALE = 1.2

/** Minimums in CSS pixels — the point below which the mixer dock stops fitting. */
const MIN_CONTENT_WIDTH = 1024
const MIN_CONTENT_HEIGHT = 680

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: Math.round(MIN_CONTENT_WIDTH * UI_SCALE),
    minHeight: Math.round(MIN_CONTENT_HEIGHT * UI_SCALE),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      zoomFactor: UI_SCALE,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  window.once('ready-to-show', () => {
    const capturePath = requestedCapturePath()
    if (capturePath === null) {
      window.show()
    } else {
      void captureAndExit(window, capturePath)
    }
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

void app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
