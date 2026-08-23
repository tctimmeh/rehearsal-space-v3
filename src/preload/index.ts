import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, type RehearsalApi } from '../shared/ipc'

const api: RehearsalApi = {
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
    chooseLibraryFolder: () => ipcRenderer.invoke(IPC_CHANNELS.configChooseLibraryFolder),
    revealLibraryFolder: () => ipcRenderer.invoke(IPC_CHANNELS.configRevealLibraryFolder)
  },
  library: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.libraryList),
    create: () => ipcRenderer.invoke(IPC_CHANNELS.libraryCreate),
    load: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryLoad, id),
    save: (song) => ipcRenderer.invoke(IPC_CHANNELS.librarySave, song),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRemove, id),
    rememberLastSong: (id) => ipcRenderer.invoke(IPC_CHANNELS.libraryRememberLastSong, id)
  }
}

contextBridge.exposeInMainWorld('rehearsal', api)
