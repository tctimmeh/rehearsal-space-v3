import { create } from 'zustand'

import { transposeLyrics } from '@core/lyrics/chords'
import { useSong } from '@renderer/state/song'

/** Typing is coalesced: writing a file on every keystroke is nobody's idea. */
const SAVE_DELAY_MS = 600

interface LyricsState {
  /** Which song the text belongs to, so a song change is never saved over. */
  songId: string | null
  text: string
  saving: boolean
  saved: boolean
  error: string | null
  load: (songId: string) => Promise<void>
  edit: (text: string) => void
  transpose: (semitones: number) => void
  flush: () => Promise<void>
}

let timer: ReturnType<typeof setTimeout> | null = null
let writing: Promise<void> = Promise.resolve()

export const useLyrics = create<LyricsState>((set, get) => ({
  songId: null,
  text: '',
  saving: false,
  saved: true,
  error: null,

  load: async (songId) => {
    cancelPending()
    set({ songId, text: '', saved: true, error: null })
    try {
      const text = await window.rehearsal.library.readLyrics(songId)
      /* The song may have been swapped while this was being read. */
      if (get().songId === songId) set({ text })
    } catch (error) {
      set({ error: `Could not read the lyrics: ${message(error)}` })
    }
  },

  edit: (text) => {
    set({ text, saved: false })
    cancelPending()
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS)
  },

  transpose: (semitones) => {
    get().edit(transposeLyrics(get().text, semitones))
  },

  /**
   * Writes are queued behind each other rather than raced. Two overlapping
   * saves of the same file can land in either order, and the loser is the one
   * that stays on disk.
   */
  flush: async () => {
    cancelPending()
    const { songId, text } = get()
    if (songId === null) return
    set({ saving: true })
    writing = writing.then(async () => {
      try {
        await window.rehearsal.library.writeLyrics(songId, text)
        if (get().songId === songId && get().text === text) set({ saved: true, error: null })
      } catch (error) {
        set({ error: `Could not save the lyrics: ${message(error)}` })
      } finally {
        set({ saving: false })
      }
    })
    await writing
  }
}))

function cancelPending(): void {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Follows whichever song is loaded, saving the last one's words before leaving. */
export function followSongForLyrics(): () => void {
  let current: string | null = null

  const change = (songId: string | null) => {
    if (songId === current) return
    const leaving = current
    current = songId
    if (leaving !== null && !useLyrics.getState().saved) void useLyrics.getState().flush()
    if (songId === null) {
      useLyrics.setState({ songId: null, text: '', saved: true })
      return
    }
    void useLyrics.getState().load(songId)
  }

  change(useSong.getState().song?.id ?? null)
  return useSong.subscribe((state) => change(state.song?.id ?? null))
}
