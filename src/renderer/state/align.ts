import { create } from 'zustand'

interface AlignState {
  /** The click track the alignment tool should be showing, if anything says. */
  clickId: string | null
  /** Points the tool at a click track — the one just added, in practice. */
  align: (clickId: string) => void
}

/**
 * Which click track the alignment tool is for.
 *
 * A song can have several, and the tool would otherwise open on whichever came
 * first — which is never the one that has just been added and is the whole
 * reason the tool is opening.
 */
export const useAlign = create<AlignState>((set) => ({
  clickId: null,
  align: (clickId) => set({ clickId })
}))
