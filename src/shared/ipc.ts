import type { Song, SongSummary } from '@core/song/song'
import type { AppConfig } from './config'

/**
 * The single source of truth for what the renderer may ask the main process to
 * do. Both sides import this; the preload bridge is built from it.
 */
export interface RehearsalApi {
  app: {
    version(): Promise<string>
    /**
     * Main asks the renderer to write pending edits before the window closes.
     * Returns an unsubscribe function.
     */
    onFlushRequest(handler: () => Promise<void>): () => void
  }
  config: {
    get(): Promise<AppConfig>
    setUiScale(scale: number): Promise<AppConfig>
    setShowCents(show: boolean): Promise<AppConfig>
    /** Opens a folder picker; returns the config unchanged if cancelled. */
    chooseLibraryFolder(): Promise<AppConfig>
    revealLibraryFolder(): Promise<void>
  }
  library: {
    list(): Promise<SongSummary[]>
    create(): Promise<Song>
    load(id: string): Promise<Song>
    save(song: Song): Promise<Song>
    remove(id: string): Promise<void>
    rememberLastSong(id: string | null): Promise<void>
  }
}

export const IPC_CHANNELS = {
  appVersion: 'app:version',
  appFlushRequest: 'app:flush-request',
  appFlushDone: 'app:flush-done',
  configGet: 'config:get',
  configSetUiScale: 'config:set-ui-scale',
  configSetShowCents: 'config:set-show-cents',
  configChooseLibraryFolder: 'config:choose-library-folder',
  configRevealLibraryFolder: 'config:reveal-library-folder',
  libraryList: 'library:list',
  libraryCreate: 'library:create',
  libraryLoad: 'library:load',
  librarySave: 'library:save',
  libraryRemove: 'library:remove',
  libraryRememberLastSong: 'library:remember-last-song'
} as const
