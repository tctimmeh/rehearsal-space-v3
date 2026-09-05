import type { ComponentType } from 'react'

import { TOOL_IDS, TOOL_META, type ToolId, type ToolSize } from '@core/tools'
import { SubjectIcon } from '../icons/subjectIcons'
import {
  WaveformIcon,
  ChordChartIcon,
  LyricsEditorIcon,
  RhymesIcon,
  TablatureIcon,
  TunerIcon
} from '../icons/uiIcons'

/** The icons live here because core is free of React; everything else about a
    tool is in `@core/tools`, so a song can record which ones are open. */
export const TOOL_ICONS: Record<ToolId, ComponentType<{ size?: number }>> = {
  metronome: ({ size }) => <SubjectIcon subject="metronome" {...(size === undefined ? {} : { size })} />,
  tuner: TunerIcon,
  lyrics: LyricsEditorIcon,
  chords: ChordChartIcon,
  tab: TablatureIcon,
  waveform: WaveformIcon,
  rhymes: RhymesIcon
}

/**
 * Rail order: the always-on gadgets, then what goes on the stage, then what
 * goes in the drawer, each group behind a gap.
 *
 * The groups are where a tool will appear, so a button's neighbours say where
 * pressing it puts something — and the two that share the drawer, which can
 * only hold one of them, sit together.
 *
 * The waveform leads the stage tools because it is where the stage starts and
 * where it returns when nothing else is chosen.
 */
export const RAIL_ORDER: (ToolId | 'gap')[] = [
  'metronome',
  'tuner',
  'gap',
  'waveform',
  'tab',
  'lyrics',
  'gap',
  'chords',
  'rhymes'
]

export const toolsOfSize = (size: ToolSize) =>
  TOOL_IDS.map((id) => TOOL_META[id]).filter((tool) => tool.size === size)
