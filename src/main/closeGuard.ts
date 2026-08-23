import { ipcMain, type BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'

/** Long enough for one small file write; short enough not to feel stuck. */
const FLUSH_TIMEOUT_MS = 2000

/**
 * Edits are coalesced before they are written, so closing the window has to
 * give the renderer a moment to finish saving. A wedged or already-gone
 * renderer must never prevent the window from closing.
 */
export function guardClose(window: BrowserWindow): void {
  let closing = false

  window.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    closing = true

    let finished = false
    const finish = (): void => {
      if (finished) return
      finished = true
      ipcMain.off(IPC_CHANNELS.appFlushDone, finish)
      if (!window.isDestroyed()) window.destroy()
    }

    ipcMain.once(IPC_CHANNELS.appFlushDone, finish)
    window.webContents.send(IPC_CHANNELS.appFlushRequest)
    setTimeout(finish, FLUSH_TIMEOUT_MS)
  })
}
