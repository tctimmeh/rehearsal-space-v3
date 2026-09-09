import { create } from 'zustand'

import type { Channel } from '@core/song/song'
import { useSong } from './song'
import { openTool } from './toolActions'
import { useWaveformView } from './waveformView'

/** Close enough to see a transient, wide enough to see what it belongs to. */
const WORKING_SPAN = 4

export type EditKind = 'trim' | 'click'

export interface WaveformEdit {
  kind: EditKind
  channelId: string
  /** The channel as it stood when this began, which cancelling puts back. */
  before: Channel
}

interface WaveformEditState {
  editing: WaveformEdit | null
  /** Opens the tool on one channel, and remembers how to undo what follows. */
  begin: (kind: EditKind, channel: Channel) => void
  save: () => Promise<void>
  cancel: () => Promise<void>
}

/**
 * Trimming a take and lining up a click track, held open until they are agreed
 * to.
 *
 * Both used to be modes of the waveform tool, sitting beside the loop region on
 * a row of tabs and applying every drag straight to the song. A tool left on
 * trim is a tool where dragging the waveform to look at it moves a channel out
 * of time with everything else, and there was nothing to undo it with.
 *
 * So they are reached from the channel they act on, one at a time, and the
 * changes stand only while the session does. They are applied as they are made
 * — a click track is lined up by ear as much as by eye, and a change nobody can
 * hear is a change nobody can judge — and cancelling puts back the channel as
 * it was.
 */
export const useWaveformEdit = create<WaveformEditState>((set, get) => ({
  editing: null,

  begin: (kind, channel) => {
    if (get().editing !== null) return
    set({ editing: { kind, channelId: channel.id, before: channel } })
    openTool('waveform')

    /* Opened to be worked on, so the view goes to it rather than leaving it a
       speck in a view of the whole song. */
    const song = useSong.getState().song
    if (song === null) return
    useWaveformView.getState().remember(song.id, {
      span: WORKING_SPAN,
      centre: channel.kind === 'metronome' ? channel.endTime : channel.startTime
    })
  },

  save: async () => {
    if (get().editing === null) return
    set({ editing: null })
    await useSong.getState().flush()
  },

  cancel: async () => {
    const editing = get().editing
    if (editing === null) return
    set({ editing: null })

    const song = useSong.getState().song
    if (song !== null) {
      useSong.getState().update({
        channels: song.channels.map((one) =>
          one.id === editing.channelId ? editing.before : one
        )
      })
    }
    await useSong.getState().flush()
  }
}))
