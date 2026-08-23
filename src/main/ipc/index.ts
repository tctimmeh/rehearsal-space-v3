import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'

import { migrateSong } from '@core/song/migrate'
import { UI_SCALE_MAX, UI_SCALE_MIN } from '../../shared/config'
import { IPC_CHANNELS } from '../../shared/ipc'
import { readConfig, updateConfig } from '../config'
import { jobs } from '../jobs'
import { toolStatus } from '../tools'
import { createSong, deleteSong, listSongs, readSong, writeSong } from '../library'

/** Applies a new zoom to every open window, so a scale change is immediate. */
function applyUiScale(scale: number): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.setZoomFactor(scale)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appVersion, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.configGet, () => readConfig())

  ipcMain.handle(IPC_CHANNELS.configSetUiScale, async (_event, scale: unknown) => {
    const requested = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1
    const uiScale = Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, requested))
    const config = await updateConfig({ uiScale })
    applyUiScale(config.uiScale)
    return config
  })

  ipcMain.handle(IPC_CHANNELS.configSetShowCents, (_event, show: unknown) =>
    updateConfig({ showCents: show === true })
  )

  ipcMain.handle(IPC_CHANNELS.configChooseLibraryFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: 'Choose library folder',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: (await readConfig()).libraryPath
    }
    const result = await (window === null
      ? dialog.showOpenDialog(options)
      : dialog.showOpenDialog(window, options))

    const chosen = result.filePaths[0]
    if (result.canceled || chosen === undefined) return readConfig()
    return updateConfig({ libraryPath: chosen })
  })

  ipcMain.handle(IPC_CHANNELS.configRevealLibraryFolder, async () => {
    const { libraryPath } = await readConfig()
    await shell.openPath(libraryPath)
  })

  ipcMain.handle(IPC_CHANNELS.libraryList, () => listSongs())
  ipcMain.handle(IPC_CHANNELS.libraryCreate, () => createSong())
  ipcMain.handle(IPC_CHANNELS.libraryLoad, (_event, id: string) => readSong(id))

  ipcMain.handle(IPC_CHANNELS.librarySave, (_event, song: unknown) => {
    /* Never trust the renderer's shape; run it through the same parser as disk. */
    const id = typeof song === 'object' && song !== null ? String((song as { id: unknown }).id) : ''
    return writeSong(migrateSong(song, id))
  })

  ipcMain.handle(IPC_CHANNELS.libraryRemove, (_event, id: string) => deleteSong(id))

  ipcMain.handle(IPC_CHANNELS.libraryRememberLastSong, async (_event, id: string | null) => {
    await updateConfig({ lastSongId: id })
  })

  ipcMain.handle(IPC_CHANNELS.jobsList, () => jobs.list())
  ipcMain.handle(IPC_CHANNELS.jobsLog, (_event, id: string) => jobs.log(id))
  ipcMain.handle(IPC_CHANNELS.jobsCancel, (_event, id: string) => jobs.cancel(id))
  ipcMain.handle(IPC_CHANNELS.jobsDismiss, (_event, id: string) => jobs.dismiss(id))

  ipcMain.handle(IPC_CHANNELS.toolsStatus, (_event, refresh: unknown) =>
    toolStatus({ refresh: refresh === true })
  )
}
