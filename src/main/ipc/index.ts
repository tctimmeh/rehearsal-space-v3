import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'

import { migrateSong } from '@core/song/migrate'
import type { Preferences } from '../../shared/config'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { SeparateRequest } from '../../shared/stems'
import { isExternalTool } from '../../shared/tools'
import { readConfig, updateConfig } from '../config'
import { jobs } from '../jobs'
import { AUDIO_EXTENSIONS } from '../import/importAudio'
import { setToolPath, toolStatus } from '../tools'
import {
  createSong,
  deleteSong,
  downloadChannel,
  importChannel,
  listSongs,
  readSong,
  readChannelAudio,
  readChannelPeaks,
  removeChannel,
  separateChannel,
  writeSong
} from '../library'

/**
 * Imports run one after another rather than all at once: they are ffmpeg-bound,
 * and four at a time would make each of them slower without finishing sooner.
 */
async function importAll(songId: string, paths: string[]) {
  let song = await readSong(songId)
  for (const path of paths) {
    song = await importChannel(songId, path)
  }
  return song
}

/** Applies a new zoom to every open window, so a scale change is immediate. */
function applyUiScale(scale: number): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.setZoomFactor(scale)
  }
}

export function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.appVersion, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.configGet, () => readConfig())

  ipcMain.handle(IPC_CHANNELS.configSet, async (_event, patch: unknown) => {
    const wanted = typeof patch === 'object' && patch !== null ? (patch as Preferences) : {}
    const config = await updateConfig(wanted)
    applyUiScale(config.uiScale)
    return config
  })

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

  ipcMain.handle(IPC_CHANNELS.libraryChooseAudio, async (event, songId: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: 'Import audio',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio', extensions: AUDIO_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = await (window === null
      ? dialog.showOpenDialog(options)
      : dialog.showOpenDialog(window, options))

    if (result.canceled || result.filePaths.length === 0) return null
    return importAll(songId, result.filePaths)
  })

  ipcMain.handle(IPC_CHANNELS.libraryImportAudio, (_event, songId: string, paths: string[]) =>
    importAll(songId, paths)
  )

  ipcMain.handle(
    IPC_CHANNELS.libraryRemoveChannel,
    (_event, songId: string, channelId: string) => removeChannel(songId, channelId)
  )

  ipcMain.handle(IPC_CHANNELS.libraryReadAudio, (_event, songId: string, file: string) =>
    readChannelAudio(songId, file)
  )

  ipcMain.handle(IPC_CHANNELS.libraryReadPeaks, (_event, songId: string, channelId: string) =>
    readChannelPeaks(songId, channelId)
  )

  ipcMain.handle(IPC_CHANNELS.libraryDownloadAudio, (_event, songId: string, url: string) =>
    downloadChannel(songId, url)
  )

  ipcMain.handle(IPC_CHANNELS.librarySeparate, (_event, songId: string, request: SeparateRequest) =>
    separateChannel(songId, request)
  )

  ipcMain.handle(IPC_CHANNELS.jobsList, () => jobs.list())
  ipcMain.handle(IPC_CHANNELS.jobsLog, (_event, id: string) => jobs.log(id))
  ipcMain.handle(IPC_CHANNELS.jobsCancel, (_event, id: string) => jobs.cancel(id))
  ipcMain.handle(IPC_CHANNELS.jobsDismiss, (_event, id: string) => jobs.dismiss(id))

  ipcMain.handle(IPC_CHANNELS.toolsStatus, (_event, refresh: unknown) =>
    toolStatus({ refresh: refresh === true })
  )

  ipcMain.handle(IPC_CHANNELS.toolsChoose, async (event, tool: unknown) => {
    if (!isExternalTool(tool)) throw new Error(`Unknown tool: ${String(tool)}`)

    const window = BrowserWindow.fromWebContents(event.sender)
    const options: OpenDialogOptions = {
      title: `Choose the ${tool} executable`,
      properties: ['openFile'],
      defaultPath: (await readConfig()).toolPaths[tool] ?? '/usr/bin'
    }
    const result = await (window === null
      ? dialog.showOpenDialog(options)
      : dialog.showOpenDialog(window, options))

    const chosen = result.filePaths[0]
    if (result.canceled || chosen === undefined) return null
    return setToolPath(tool, chosen)
  })

  ipcMain.handle(IPC_CHANNELS.toolsClear, (_event, tool: unknown) => {
    if (!isExternalTool(tool)) throw new Error(`Unknown tool: ${String(tool)}`)
    return setToolPath(tool, null)
  })
}
