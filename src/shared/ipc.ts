/**
 * The single source of truth for what the renderer may ask the main process to
 * do. Both sides import this; the preload bridge is built from it.
 */
export interface RehearsalApi {
  app: {
    version(): Promise<string>
  }
}

export const IPC_CHANNELS = {
  appVersion: 'app:version'
} as const
