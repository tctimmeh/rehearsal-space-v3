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
  /**
   * What is waiting on an answer while the user is asked what to do with the
   * session they already have open. Null when nothing is being asked.
   */
  asking: (() => void) | null
  /** Opens the tool on one channel, and remembers how to undo what follows. */
  begin: (kind: EditKind, channel: Channel) => void
  /** Does something that would leave the open session, asking about it first. */
  leaving: (go: () => void) => void
  save: () => Promise<void>
  cancel: () => Promise<void>
  /** The three answers: keep it and go on, throw it away and go on, or stay. */
  saveAndGo: () => Promise<void>
  discardAndGo: () => Promise<void>
  stay: () => void
}

/** What the stage calls itself while a session is open. */
export const describeEdit = (editing: WaveformEdit, channels: readonly Channel[]): string => {
  const name = channels.find((one) => one.id === editing.channelId)?.name ?? editing.before.name
  return editing.kind === 'trim' ? `Trimming ${name}` : `Lining up ${name}`
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
 *
 * Anything that would leave a session behind asks first. Neither answer can be
 * guessed: saving silently is how the old modes lost people's takes, and
 * throwing the work away silently is worse.
 */
export const useWaveformEdit = create<WaveformEditState>((set, get) => {
  const start = (kind: EditKind, channel: Channel): void => {
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
  }

  /** Whatever was waiting on an answer, now that there is one. */
  const carryOn = (): void => {
    const go = get().asking
    set({ asking: null })
    go?.()
  }

  return {
    editing: null,
    asking: null,

    begin: (kind, channel) => {
      const open = get().editing
      if (open?.channelId === channel.id && open.kind === kind) return
      if (open === null) {
        start(kind, channel)
        return
      }
      set({ asking: () => start(kind, channel) })
    },

    leaving: (go) => {
      if (get().editing === null) {
        go()
        return
      }
      set({ asking: go })
    },

    stay: () => set({ asking: null }),

    saveAndGo: async () => {
      await get().save()
      carryOn()
    },

    discardAndGo: async () => {
      await get().cancel()
      carryOn()
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
  }
})
