import { BrowserWindow } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc'
import type { Job } from '../../shared/jobs'
import { createJobManager } from './manager'

/** One queue for the whole app, pushed to every window as it changes. */
export const jobs = createJobManager((snapshot: Job[]) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.jobsChanged, snapshot)
  }
})

export { JobFailedError } from './manager'
export type { JobSpec } from './manager'
