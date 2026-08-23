import type { ExternalTool } from './tools'

export interface AppConfig {
  /** Directory holding one sub-directory per song. */
  libraryPath: string
  lastSongId: string | null
  /** Renderer zoom. This is a tool read from a music stand, so it starts above 1. */
  uiScale: number
  /** Reveals the cents knob beside the pitch knob. Off by default: most
      practice is in whole semitones. */
  showCents: boolean
  /** Explicit locations for external tools, overriding the search. */
  toolPaths: Partial<Record<ExternalTool, string>>
}

export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05
