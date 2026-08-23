import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type RehearsalApi } from '../shared/ipc'

const api: RehearsalApi = {
  app: {
    version: () => ipcRenderer.invoke(IPC_CHANNELS.appVersion)
  }
}

contextBridge.exposeInMainWorld('rehearsal', api)
