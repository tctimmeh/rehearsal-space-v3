import { TOOL_META, type ToolId } from '@core/tools'

import { useSong } from './song'
import { openSongScopedTools, useTools } from './tools'

/**
 * Song-scoped tools reopen where you left them, so any change to which ones are
 * open is part of the song. Gadgets are app-wide and are not saved here.
 */
function persistIfSongScoped(id: ToolId): void {
  if (TOOL_META[id].scope !== 'song') return
  const song = useSong.getState().song
  if (song === null) return
  void useSong.getState().update({ openTools: openSongScopedTools(useTools.getState().open) })
}

export function toggleTool(id: ToolId): void {
  useTools.getState().toggle(id)
  persistIfSongScoped(id)
}

/** Opens a tool, or leaves it open if it already is. */
export function openTool(id: ToolId): void {
  if (useTools.getState().open[id]) return
  toggleTool(id)
}

export function closeTool(id: ToolId): void {
  useTools.getState().close(id)
  persistIfSongScoped(id)
}
