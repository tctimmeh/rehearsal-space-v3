import { vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import type { RehearsalApi } from '@shared/ipc'

/**
 * A stand-in for the preload bridge. Saving echoes the song straight back, the
 * way the main process does when nothing needs renaming.
 */
export function installBridge(overrides: Partial<RehearsalApi['library']> = {}) {
  const library = {
    list: vi.fn(async () => []),
    create: vi.fn(async () => newSong('new-song')),
    load: vi.fn(async (id: string) => newSong(id)),
    save: vi.fn(async (song: Song) => song),
    remove: vi.fn(async () => undefined),
    rememberLastSong: vi.fn(async () => undefined),
    chooseAudio: vi.fn(async () => null),
    importAudio: vi.fn(async () => newSong('x')),
    removeChannel: vi.fn(async () => newSong('x')),
    ...overrides
  }

  Object.defineProperty(globalThis.window, 'rehearsal', {
    configurable: true,
    value: {
      pathForFile: () => '',
      app: { version: vi.fn(), onFlushRequest: vi.fn(() => () => undefined) },
      config: {
        get: vi.fn(),
        set: vi.fn(),
        chooseLibraryFolder: vi.fn(),
        revealLibraryFolder: vi.fn()
      },
      library,
      jobs: {
        list: vi.fn(async () => []),
        log: vi.fn(async () => []),
        cancel: vi.fn(),
        dismiss: vi.fn(),
        onChanged: vi.fn(() => () => undefined)
      },
      tools: { status: vi.fn(async () => []), choose: vi.fn(), clear: vi.fn() }
    }
  })

  return library
}
