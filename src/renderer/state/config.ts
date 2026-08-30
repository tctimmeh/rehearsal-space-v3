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
    /* Kept here before it is sent. Writing a setting is a trip to the main
       process, and a knob turned or a key held moves faster than one comes
       back — so a second change reckoned from a value that has not caught up
       is a change that never happens. The answer still wins when it arrives,
       which is what clamps anything out of range. */
    const known = get().config
    if (known !== null) set({ config: { ...known, ...patch } })
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
