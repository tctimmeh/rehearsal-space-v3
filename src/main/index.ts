import { join } from 'node:path'
import { app, BrowserWindow, Menu, session, shell } from 'electron'

import { readConfig } from './config'
import { captureAndExit, requestedCapturePath } from './devCapture'
import { editItemsFor } from './editMenu'
import { guardClose } from './closeGuard'
import { jobs } from './jobs'
import { registerIpcHandlers } from './ipc'
import { fetchMissingTools, watchToolInstalls } from './tools'
import { IPC_CHANNELS } from '../shared/ipc'
import type { ToolInstall } from '../shared/tools'

/**
 * The window is scaled by the user's UI scale (default 1.2): this is a tool you
 * read from a music stand with an instrument in your hands, not from a desk.
 */

/** Minimums in CSS pixels — the point below which the mixer dock stops fitting. */
const MIN_CONTENT_WIDTH = 1024
const MIN_CONTENT_HEIGHT = 680

function createWindow(uiScale: number): BrowserWindow {
  const window = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: Math.round(MIN_CONTENT_WIDTH * uiScale),
    minHeight: Math.round(MIN_CONTENT_HEIGHT * uiScale),
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0e0e11',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      zoomFactor: uiScale,
      /* Playback follows a button the user pressed; there is no page to
         wander onto and be ambushed by sound. */
      autoplayPolicy: 'no-user-gesture-required',
      /* Chromium slows timers and animation frames for windows it thinks
         nobody is looking at. A song playing behind another window is still
         being listened to. */
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  guardClose(window)

  window.once('ready-to-show', () => {
    const capturePath = requestedCapturePath()
    if (capturePath === null) {
      window.show()
    } else {
      void captureAndExit(window, capturePath)
    }
  })

  /* Cut, copy and paste where a right-click asks for them. Electron provides
     no menu of its own, so a text field without this one is a text field that
     answers a right-click with nothing. */
  window.webContents.on('context-menu', (_event, params) => {
    const items = editItemsFor(params)
    if (items.length === 0) return
    Menu.buildFromTemplate(items).popup({ window })
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

/*
 * No menu, which means no reload.
 *
 * Electron ships a default menu whose View entry answers Ctrl-R, Ctrl-Shift-R
 * and F5 by reloading the window. This is an application, not a web page:
 * reloading throws away everything the renderer is holding, and mid-edit it
 * reads as the app having crashed and come back. The renderer cannot stop a
 * menu accelerator by preventing the key — the menu is answered above it — so
 * the menu is what has to go. The app's own menu is a button in its header,
 * and every window here is chromeless anyway.
 *
 * Taking the menu away leaves the keys themselves alone, which matters:
 * Ctrl-R is how a repeat is marked in the tablature.
 */
Menu.setApplicationMenu(null)

void app.whenReady().then(async () => {
  /*
   * The app records from an input the user chose in its own settings. There is
   * no remote content here to ask on anyone's behalf, so the only request that
   * can arrive is the one the record button just made.
   */
  session.defaultSession.setPermissionRequestHandler((_contents, permission, grant) => {
    grant(permission === 'media')
  })

  registerIpcHandlers()
  const { uiScale } = await readConfig()
  createWindow(uiScale)

  watchToolInstalls((installs: ToolInstall[]) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.toolsInstallsChanged, installs)
      }
    }
  })
  /*
   * The tools the app runs are its own business. What the machine has can be
   * upgraded, removed or broken by anything else on it, so the app keeps
   * copies of its own and fetches whatever is missing while it starts.
   */
  fetchMissingTools()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow((await readConfig()).uiScale)
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/* Nothing external should outlive the app that started it. */
app.on('will-quit', () => jobs.cancelAll())
