import { create } from 'zustand'

import { askedFor, NO_RHYMES, type Rhymes } from '@core/rhymes/rhymes'

interface RhymesState {
  /** What was typed, which is not always what was looked up. */
  typed: string
  /** The word the results below are for. */
  found: string
  rhymes: Rhymes
  looking: boolean
  error: string | null
  type: (text: string) => void
  look: () => Promise<void>
}

/** Bumped per lookup so a slow answer never lands on top of a newer one. */
let attempt = 0

export const useRhymes = create<RhymesState>((set, get) => ({
  typed: '',
  found: '',
  rhymes: NO_RHYMES,
  looking: false,
  error: null,

  type: (text) => set({ typed: text }),

  look: async () => {
    const wanted = askedFor(get().typed)
    if (wanted === '') {
      set({ rhymes: NO_RHYMES, found: '', error: null })
      return
    }

    const mine = (attempt += 1)
    set({ looking: true, error: null })
    const lookup = await window.rehearsal.rhymes.find(wanted).catch((error: unknown) => ({
      unreachable: error instanceof Error ? error.message : String(error)
    }))
    /* A slower answer to an older word must not land on top of this one. */
    if (mine !== attempt) return

    if ('unreachable' in lookup) {
      set({ looking: false, rhymes: NO_RHYMES, found: wanted, error: lookup.unreachable })
      return
    }
    set({ rhymes: lookup.found, found: wanted, looking: false })
  }
}))
