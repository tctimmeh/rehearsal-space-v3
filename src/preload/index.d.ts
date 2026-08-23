import type { RehearsalApi } from '../shared/ipc'

declare global {
  interface Window {
    rehearsal: RehearsalApi
  }
}

export {}
