import type { Song, SongSummary } from '@core/song/song'
import type { AppConfig } from './config'
import type { Job } from './jobs'
import type { ExternalTool, ToolStatus } from './tools'

/**
 * The single source of truth for what the renderer may ask the main process to
 * do. Both sides import this; the preload bridge is built from it.
 */
export interface RehearsalApi {
  /** Resolves a dropped File to a path on disk. */
  pathForFile(file: File): string
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
    /** Opens a file picker and imports what is chosen. Null when cancelled. */
    chooseAudio(songId: string): Promise<Song | null>
    /** Imports files already on disk, as from a drop. */
    importAudio(songId: string, paths: string[]): Promise<Song>
    removeChannel(songId: string, channelId: string): Promise<Song>
    /** Raw bytes of a channel's audio file, for decoding. */
    readAudio(songId: string, file: string): Promise<Uint8Array>
  }
  jobs: {
    list(): Promise<Job[]>
    log(id: string): Promise<string[]>
    cancel(id: string): Promise<void>
    dismiss(id: string): Promise<void>
    /** The queue is pushed from main whenever it changes. Returns an unsubscribe. */
    onChanged(handler: (jobs: Job[]) => void): () => void
  }
  tools: {
    /** Cached for the session; pass true after installing something. */
    status(refresh?: boolean): Promise<ToolStatus[]>
    /** Opens a file picker for the tool's binary. Null when cancelled. */
    choose(tool: ExternalTool): Promise<ToolStatus[] | null>
    /** Goes back to searching for the tool rather than using a set path. */
    clear(tool: ExternalTool): Promise<ToolStatus[]>
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
  libraryRememberLastSong: 'library:remember-last-song',
  libraryChooseAudio: 'library:choose-audio',
  libraryImportAudio: 'library:import-audio',
  libraryRemoveChannel: 'library:remove-channel',
  libraryReadAudio: 'library:read-audio',
  jobsList: 'jobs:list',
  jobsLog: 'jobs:log',
  jobsCancel: 'jobs:cancel',
  jobsDismiss: 'jobs:dismiss',
  jobsChanged: 'jobs:changed',
  toolsStatus: 'tools:status',
  toolsChoose: 'tools:choose',
  toolsClear: 'tools:clear'
} as const
