/**
 * Where a tool lands is the app's problem, not the user's — the tool declares
 * a size and the shell places it. None of this vocabulary appears on screen.
 *
 *   gadget  top strip, sized to content, several at once
 *   stage   fills the open space, one at a time
 *   drawer  slides over the right edge, overlaps rather than reflows
 */
export type ToolSize = 'gadget' | 'stage' | 'drawer'

/** `app` tools survive a song change; `song` tools are saved with the song. */
export type ToolScope = 'app' | 'song'

export const TOOL_IDS = [
  'metronome',
  'tuner',
  'lyrics',
  'chords',
  'tab',
  'waveform',
  'rhymes'
] as const
export type ToolId = (typeof TOOL_IDS)[number]

export interface ToolMeta {
  id: ToolId
  label: string
  /** Shown on the gadget strip, where the label runs vertically. */
  shortLabel: string
  size: ToolSize
  scope: ToolScope
}

export const TOOL_META: Record<ToolId, ToolMeta> = {
  metronome: {
    id: 'metronome',
    label: 'Metronome',
    shortLabel: 'Metro',
    size: 'gadget',
    scope: 'app'
  },
  tuner: { id: 'tuner', label: 'Tuner', shortLabel: 'Tuner', size: 'gadget', scope: 'app' },
  lyrics: {
    id: 'lyrics',
    label: 'Lyrics',
    shortLabel: 'Lyrics',
    size: 'stage',
    scope: 'song'
  },
  chords: {
    id: 'chords',
    label: 'Chords',
    shortLabel: 'Chords',
    /* Beside the music rather than in place of it: it is something to glance
       at while writing, not something to work in. */
    size: 'drawer',
    scope: 'song'
  },
  tab: { id: 'tab', label: 'Tablature', shortLabel: 'Tab', size: 'stage', scope: 'song' },
  waveform: {
    id: 'waveform',
    label: 'Waveform',
    shortLabel: 'Wave',
    size: 'stage',
    scope: 'song'
  },
  rhymes: { id: 'rhymes', label: 'Rhymes', shortLabel: 'Rhymes', size: 'drawer', scope: 'song' }
}

export const isToolId = (value: unknown): value is ToolId =>
  typeof value === 'string' && (TOOL_IDS as readonly string[]).includes(value)
