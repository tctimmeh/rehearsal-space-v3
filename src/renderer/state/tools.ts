import { create } from 'zustand'

import { TOOL_IDS, TOOL_META, type ToolId } from '@core/tools'

interface ToolsState {
  open: Record<ToolId, boolean>
  toggle: (id: ToolId) => void
  close: (id: ToolId) => void
  /** Replaces the open set for the tools a predicate selects, leaving the rest. */
  setOpenScoped: (selects: (id: ToolId) => boolean, open: ToolId[]) => void
}

const allClosed = Object.fromEntries(TOOL_IDS.map((id) => [id, false])) as Record<ToolId, boolean>

export const useTools = create<ToolsState>((set) => ({
  open: allClosed,

  /* Only one stage tool fits, so opening one closes the other. Gadgets and the
     drawer are independent of everything. */
  toggle: (id) =>
    set((state) => {
      const nowOpen = !state.open[id]
      if (!nowOpen || TOOL_META[id].size !== 'stage') {
        return { open: { ...state.open, [id]: nowOpen } }
      }
      const open = { ...state.open }
      for (const other of TOOL_IDS) {
        if (TOOL_META[other].size === 'stage') open[other] = other === id
      }
      return { open }
    }),

  close: (id) => set((state) => ({ open: { ...state.open, [id]: false } })),

  setOpenScoped: (selects, opened) =>
    set((state) => {
      const open = { ...state.open }
      for (const id of TOOL_IDS) {
        if (selects(id)) open[id] = opened.includes(id)
      }
      return { open }
    })
}))

export const openToolOfSize = (
  open: Record<ToolId, boolean>,
  size: 'stage' | 'drawer'
): ToolId | null => TOOL_IDS.find((id) => TOOL_META[id].size === size && open[id]) ?? null

export const openSongScopedTools = (open: Record<ToolId, boolean>): ToolId[] =>
  TOOL_IDS.filter((id) => TOOL_META[id].scope === 'song' && open[id])
