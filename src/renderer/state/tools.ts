import { create } from 'zustand'

import { TOOL_IDS, TOOL_META, type ToolId } from '@core/tools'

interface ToolsState {
  open: Record<ToolId, boolean>
  /**
   * The tool the user last opened themselves, which a song bringing its tools
   * back does not count as.
   *
   * A tool that takes the keyboard on opening — the tablature, which is all
   * keyboard — needs to tell the two apart: opening it is asking to type in
   * it, and a song arriving underneath one that was already open is not.
   */
  justOpened: ToolId | null
  toggle: (id: ToolId) => void
  close: (id: ToolId) => void
  /** Replaces the open set for the tools a predicate selects, leaving the rest. */
  setOpenScoped: (selects: (id: ToolId) => boolean, open: ToolId[]) => void
}

const allClosed = Object.fromEntries(TOOL_IDS.map((id) => [id, false])) as Record<ToolId, boolean>

export const useTools = create<ToolsState>((set) => ({
  open: allClosed,
  justOpened: null,

  /* The stage holds one tool and so does the drawer, so opening one there
     closes whatever was in its place. Gadgets stack and mind nobody. */
  toggle: (id) =>
    set((state) => {
      const nowOpen = !state.open[id]
      const asked = nowOpen ? id : state.justOpened
      const size = TOOL_META[id].size
      /* Gadgets sit side by side and mind nobody. The stage and the drawer are
         each one place, so opening something there closes whatever held it. */
      if (!nowOpen || size === 'gadget') {
        return { open: { ...state.open, [id]: nowOpen }, justOpened: asked }
      }
      const open = { ...state.open }
      for (const other of TOOL_IDS) {
        if (TOOL_META[other].size === size) open[other] = other === id
      }
      return { open, justOpened: asked }
    }),

  close: (id) => set((state) => ({ open: { ...state.open, [id]: false } })),

  /* A song bringing its tools back is not somebody asking for one, which is
     why nothing here counts as just opened. */
  setOpenScoped: (selects, opened) =>
    set((state) => {
      const open = { ...state.open }
      for (const id of TOOL_IDS) {
        if (selects(id)) open[id] = opened.includes(id)
      }
      return { open, justOpened: null }
    })
}))

/**
 * The stage is never empty. Looking at the song is the thing you are most
 * often doing, so that is what it falls back to when nothing else is chosen —
 * and there is nothing to close, because there would be nothing behind it.
 */
export const DEFAULT_STAGE_TOOL: ToolId = 'waveform'

export const stageOnShow = (open: Record<ToolId, boolean>): ToolId =>
  openToolOfSize(open, 'stage') ?? DEFAULT_STAGE_TOOL

export const openToolOfSize = (
  open: Record<ToolId, boolean>,
  size: 'stage' | 'drawer'
): ToolId | null => TOOL_IDS.find((id) => TOOL_META[id].size === size && open[id]) ?? null

export const openSongScopedTools = (open: Record<ToolId, boolean>): ToolId[] =>
  TOOL_IDS.filter((id) => TOOL_META[id].scope === 'song' && open[id])
