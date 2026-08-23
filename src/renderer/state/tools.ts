import { create } from 'zustand'

import { TOOLS, TOOL_IDS, type ToolId } from '../ui/tools/registry'

interface ToolsState {
  open: Record<ToolId, boolean>
  toggle: (id: ToolId) => void
  close: (id: ToolId) => void
}

const allClosed = Object.fromEntries(TOOL_IDS.map((id) => [id, false])) as Record<ToolId, boolean>

/**
 * Only one stage tool fits, so opening one closes the other. Gadgets and the
 * drawer are independent of everything.
 */
export const useTools = create<ToolsState>((set) => ({
  open: allClosed,
  toggle: (id) =>
    set((state) => {
      const nowOpen = !state.open[id]
      if (!nowOpen || TOOLS[id].size !== 'stage') {
        return { open: { ...state.open, [id]: nowOpen } }
      }
      const open = { ...state.open }
      for (const other of TOOL_IDS) {
        if (TOOLS[other].size === 'stage') open[other] = other === id
      }
      return { open }
    }),
  close: (id) => set((state) => ({ open: { ...state.open, [id]: false } }))
}))

export const openStageTool = (open: Record<ToolId, boolean>): ToolId | null =>
  TOOL_IDS.find((id) => TOOLS[id].size === 'stage' && open[id]) ?? null

export const openDrawerTool = (open: Record<ToolId, boolean>): ToolId | null =>
  TOOL_IDS.find((id) => TOOLS[id].size === 'drawer' && open[id]) ?? null
