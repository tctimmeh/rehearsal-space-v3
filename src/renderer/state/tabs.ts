import type { TabFile } from '@core/song/song'
import { newTab, normalise, type TabDoc } from '@core/tab/document'
import { parse } from '@core/tab/parse'
import { render } from '@core/tab/render'
import { useSong } from '@renderer/state/song'

import { create } from 'zustand'

/**
 * The tablature file that is open, and getting it on and off disk.
 *
 * The document is the thing being edited; the text is what it is written down
 * as. Both are kept: parsing on every keystroke to save, or re-rendering to
 * read, would be work done twice over for no one's benefit.
 */
const SAVE_DELAY_MS = 600

interface TabsState {
  /** Which song and which of its files, so a swap is never saved over. */
  songId: string | null
  tabId: string | null
  /**
   * Where it lives, remembered rather than looked up when saving.
   *
   * By the time the last write of an outgoing song happens, the song store has
   * already moved on to the next one, and there would be nowhere left to ask.
   */
  file: string | null
  doc: TabDoc
  /** Bumped when the document changes from outside the editor. */
  revision: number
  saving: boolean
  saved: boolean
  error: string | null

  open: (songId: string, tab: TabFile) => Promise<void>
  close: () => void
  edit: (doc: TabDoc) => void
  flush: () => Promise<void>
}

let timer: ReturnType<typeof setTimeout> | null = null
let writing: Promise<void> = Promise.resolve()

const cancelPending = (): void => {
  if (timer !== null) clearTimeout(timer)
  timer = null
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const useTabs = create<TabsState>((set, get) => ({
  songId: null,
  tabId: null,
  file: null,
  doc: newTab(),
  revision: 0,
  saving: false,
  saved: true,
  error: null,

  open: async (songId, tab) => {
    cancelPending()
    set({
      songId,
      tabId: tab.id,
      file: tab.file,
      doc: newTab(tab.strings),
      revision: get().revision + 1,
      saved: true,
      error: null
    })
    try {
      const text = await window.rehearsal.library.readTab(songId, tab.file)
      /* The song or the file may have been swapped while this was being read. */
      if (get().songId !== songId || get().tabId !== tab.id) return
      const doc = text.trim() === '' ? newTab(tab.strings) : parse(text)
      set({ doc, revision: get().revision + 1 })
    } catch (error) {
      set({ error: `Could not read the tab: ${message(error)}` })
    }
  },

  close: () => {
    cancelPending()
    set({ songId: null, tabId: null, file: null, doc: newTab(), saved: true, error: null })
  },

  edit: (doc) => {
    set({ doc, saved: false })
    cancelPending()
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS)
  },

  /**
   * Writes are queued behind each other rather than raced. Two overlapping
   * saves of the same file can land in either order, and the loser is the one
   * that stays on disk.
   */
  flush: async () => {
    cancelPending()
    const { songId, tabId, file, doc } = get()
    if (songId === null || tabId === null || file === null) return

    /* A sixteenth that has been emptied but not yet left is a state the editor
       holds and the drawing cannot spell, so the file gets the tidy version. */
    const text = render(normalise(doc))
    set({ saving: true })
    writing = writing.then(async () => {
      try {
        await window.rehearsal.library.writeTab(songId, file, text)
        if (get().songId === songId && get().tabId === tabId && render(normalise(get().doc)) === text) {
          set({ saved: true, error: null })
        }
      } catch (error) {
        set({ error: `Could not save the tab: ${message(error)}` })
      } finally {
        set({ saving: false })
      }
    })
    await writing
  }
}))

/**
 * Closes whatever was open when the song changes, having written it first.
 *
 * Writing takes a turn of the event loop, and by the time it is done the
 * editor may have opened a file belonging to the song that has just arrived —
 * on the first load it certainly has, since the song appearing is itself the
 * change being answered. Closing then would shut a file nobody asked to close,
 * and every keystroke after it would be dropped. So what was open is noted
 * first, and only that is closed.
 */
export function followSongForTabs(): () => void {
  return useSong.subscribe((state, previous) => {
    if (state.song?.id === previous.song?.id) return
    const leaving = useTabs.getState().songId
    if (leaving === null) return
    void useTabs
      .getState()
      .flush()
      .then(() => {
        if (useTabs.getState().songId === leaving) useTabs.getState().close()
      })
  })
}
