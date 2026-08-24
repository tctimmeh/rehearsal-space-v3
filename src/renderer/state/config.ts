import { create } from 'zustand'

import type { AppConfig, Preferences } from '@shared/config'

interface ConfigState {
  config: AppConfig | null
  load: () => Promise<AppConfig>
  set: (patch: Partial<Preferences>) => Promise<void>
  chooseLibraryFolder: () => Promise<AppConfig | null>
  revealLibraryFolder: () => Promise<void>
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: null,

  load: async () => {
    const config = await window.rehearsal.config.get()
    set({ config })
    return config
  },

  set: async (patch) => {
    set({ config: await window.rehearsal.config.set(patch) })
  },

  /** Returns the new config only when the folder actually changed. */
  chooseLibraryFolder: async () => {
    const previous = get().config?.libraryPath
    const config = await window.rehearsal.config.chooseLibraryFolder()
    set({ config })
    return config.libraryPath === previous ? null : config
  },

  revealLibraryFolder: () => window.rehearsal.config.revealLibraryFolder()
}))
