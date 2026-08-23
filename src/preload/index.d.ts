import type { RehearsalApi } from '../shared/ipc.js'

declare global {
  interface Window {
    rehearsal: RehearsalApi
  }
}

export {}
