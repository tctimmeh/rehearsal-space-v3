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
  /** Fraction of the visible window a wheel notch pans in the alignment tool. */
  panSpeed: number
  /** Zoom steps a wheel notch is worth. Below 1, several notches make a step. */
  zoomSpeed: number
  /** Explicit locations for external tools, overriding the search. */
  toolPaths: Partial<Record<ExternalTool, string>>
}

export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 2
export const UI_SCALE_STEP = 0.05

export const PAN_SPEED_MIN = 0.02
export const PAN_SPEED_MAX = 0.6
export const PAN_SPEED_STEP = 0.02

export const ZOOM_SPEED_MIN = 0.05
export const ZOOM_SPEED_MAX = 1
export const ZOOM_SPEED_STEP = 0.05

/** Settings the user can simply set, as against those with their own flow. */
export type Preferences = Pick<AppConfig, 'uiScale' | 'showCents' | 'panSpeed' | 'zoomSpeed'>
