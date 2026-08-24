import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'

import { IPC_CHANNELS, type RehearsalApi } from '../shared/ipc'
import type { Job } from '../shared/jobs'

const api: RehearsalApi = {
  /* Electron no longer puts a path on File; this is the sanctioned way to get one. */
  pathForFile: (file) => webUtils.getPathForFile(file),
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.appVersion),
    onFlushRequest: (handler) => {
      const listener = () => {
        void handler().finally(() => ipcRenderer.send(IPC_CHANNELS.appFlushDone))
      }
      ipcRenderer.on(IPC_CHANNELS.appFlushRequest, listener)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.appFlushRequest, listener)
      }
    }
  },
  config: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.configGet),
    setUiScale: (scale) => ipcRenderer.invoke(IPC_CHANNELS.configSetUiScale, scale),
    setShowCents: (show) => ipcRenderer.invoke(IPC_CHANNELS.configSetShowCents, show),
    chooseLibraryFolder: () => ipcRenderer.invoke(IPC_CHANNELS.configChooseLibraryFolder),
    revealLibraryFolder: () => ipcRenderer.invoke(IPC_CHANNELS.configRevealLibraryFolder)
  },
  library: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.libraryList),
    create: () => ipcRenderer.invoke(IPC_CHANNELS.libraryCreate),
    load: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryLoad, id),
    save: (song) => ipcRenderer.invoke(IPC_CHANNELS.librarySave, song),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRemove, id),
    rememberLastSong: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRememberLastSong, id),
    chooseAudio: (songId) => ipcRenderer.invoke(IPC_CHANNELS.libraryChooseAudio, songId),
    importAudio: (songId, paths) =>
      ipcRenderer.invoke(IPC_CHANNELS.libraryImportAudio, songId, paths),
    removeChannel: (songId, channelId) =>
      ipcRenderer.invoke(IPC_CHANNELS.libraryRemoveChannel, songId, channelId)
  },
  jobs: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.jobsList),
    log: (id) => ipcRenderer.invoke(IPC_CHANNELS.jobsLog, id),
    cancel: (id) => ipcRenderer.invoke(IPC_CHANNELS.jobsCancel, id),
    dismiss: (id) => ipcRenderer.invoke(IPC_CHANNELS.jobsDismiss, id),
    onChanged: (handler) => {
      const listener = (_event: IpcRendererEvent, jobs: Job[]): void => handler(jobs)
      ipcRenderer.on(IPC_CHANNELS.jobsChanged, listener)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.jobsChanged, listener)
      }
    }
  },
  tools: {
    status: (refresh) => ipcRenderer.invoke(IPC_CHANNELS.toolsStatus, refresh === true),
    choose: (tool) => ipcRenderer.invoke(IPC_CHANNELS.toolsChoose, tool),
    clear: (tool) => ipcRenderer.invoke(IPC_CHANNELS.toolsClear, tool)
  }
}

contextBridge.exposeInMainWorld('rehearsal', api)
