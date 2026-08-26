import { create } from 'zustand'

export const VIEWS = [
  { id: 'library', label: 'Library' },
  { id: 'player', label: 'Player' }
] as const

export type ViewId = (typeof VIEWS)[number]['id']

interface ViewState {
  view: ViewId
  setView: (view: ViewId) => void
}

export const useView = create<ViewState>((set) => ({
  view: 'player',
  setView: (view) => set({ view })
}))
