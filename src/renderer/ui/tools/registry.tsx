import type { ComponentType } from 'react'

import { SubjectIcon } from '../icons/subjectIcons'
import {
  AlignIcon,
  ChordChartIcon,
  LyricsEditorIcon,
  RhymesIcon,
  TunerIcon
} from '../icons/uiIcons'

export const TOOL_IDS = ['metronome', 'tuner', 'lyrics', 'chords', 'align', 'rhymes'] as const
export type ToolId = (typeof TOOL_IDS)[number]

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

export interface ToolDefinition {
  id: ToolId
  label: string
  /** Shown on the gadget strip, where the label runs vertically. */
  shortLabel: string
  size: ToolSize
  scope: ToolScope
  icon: ComponentType<{ size?: number }>
}

export const TOOLS: Record<ToolId, ToolDefinition> = {
  metronome: {
    id: 'metronome',
    label: 'Metronome',
    shortLabel: 'Metro',
    size: 'gadget',
    scope: 'app',
    icon: ({ size }) => <SubjectIcon subject="metronome" {...(size === undefined ? {} : { size })} />
  },
  tuner: { id: 'tuner', label: 'Tuner', shortLabel: 'Tuner', size: 'gadget', scope: 'app', icon: TunerIcon },
  lyrics: {
    id: 'lyrics',
    label: 'Lyrics editor',
    shortLabel: 'Lyrics',
    size: 'stage',
    scope: 'song',
    icon: LyricsEditorIcon
  },
  chords: { id: 'chords', label: 'Chord chart', shortLabel: 'Chords', size: 'stage', scope: 'song', icon: ChordChartIcon },
  align: { id: 'align', label: 'Align click track', shortLabel: 'Align', size: 'stage', scope: 'song', icon: AlignIcon },
  rhymes: { id: 'rhymes', label: 'Rhymes', shortLabel: 'Rhymes', size: 'drawer', scope: 'song', icon: RhymesIcon }
}

/** Rail order, with a gap separating the always-on gadgets from the rest. */
export const RAIL_ORDER: (ToolId | 'gap')[] = [
  'metronome',
  'tuner',
  'gap',
  'lyrics',
  'chords',
  'align',
  'gap',
  'rhymes'
]

export const toolsOfSize = (size: ToolSize): ToolDefinition[] =>
  TOOL_IDS.map((id) => TOOLS[id]).filter((tool) => tool.size === size)
