import { create } from 'zustand'

import type { AppConfig } from '@shared/config'

interface ConfigState {
  config: AppConfig | null
  load: () => Promise<AppConfig>
  setUiScale: (scale: number) => Promise<void>
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

  setUiScale: async (scale) => {
    set({ config: await window.rehearsal.config.setUiScale(scale) })
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
