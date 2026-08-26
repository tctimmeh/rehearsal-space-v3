import type { MetronomeSample } from '../core/song/song'
import type { ExternalTool } from './tools'

/** The stand-alone metronome, which belongs to the app rather than a song. */
export interface MetronomeSettings {
  bpm: number
  beatsPerMeasure: number
  accentFirstBeat: boolean
  sample: MetronomeSample
}

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
  /** Fraction of a doubling a wheel notch zooms by. Every notch moves. */
  zoomSpeed: number
  /** Which input to record from. Empty means the system default. */
  inputDeviceId: string
  /** Which channel of that device: 0 for all of them, otherwise 1-based. */
  inputChannel: number
  /** Where the stand-alone metronome was left. */
  metronome: MetronomeSettings
  /** Explicit locations for external tools, overriding the search. */
  toolPaths: Partial<Record<ExternalTool, string>>
}

export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 2
/* All three of these are read as a percentage and turned with a wheel, so a
   notch moves one point of what the readout says. */
export const UI_SCALE_STEP = 0.01
/** This is a tool read from a music stand, so it starts above 1. */
export const UI_SCALE_DEFAULT = 1.2

export const PAN_SPEED_MIN = 0.02
export const PAN_SPEED_MAX = 0.6
export const PAN_SPEED_STEP = 0.01
/* A tenth of the window per notch, and about 11% closer or wider. Settled by
   using it, and where a double-click on the knob puts it back to. */
export const PAN_SPEED_DEFAULT = 0.1

export const ZOOM_SPEED_MIN = 0.05
export const ZOOM_SPEED_MAX = 1
export const ZOOM_SPEED_STEP = 0.01
export const ZOOM_SPEED_DEFAULT = 0.15

/** Settings the user can simply set, as against those with their own flow. */
export type Preferences = Pick<
  AppConfig,
  | 'uiScale'
  | 'showCents'
  | 'panSpeed'
  | 'zoomSpeed'
  | 'inputDeviceId'
  | 'inputChannel'
  | 'metronome'
>
