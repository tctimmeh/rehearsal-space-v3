// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { newTab } from '@core/tab/document'
import { installBridge } from '@renderer/testing/bridge'
import { useSong } from './song'
import { followSongForTabs, useTabs } from './tabs'

const tab = { id: 'tab', file: 'tabs/tab.txt', name: 'Tab', strings: 6 }
const songWith = (id: string): Song => ({ ...newSong(id), id, tabs: [tab] })

let unwire = () => undefined as void

beforeEach(() => {
  installBridge()
  window.rehearsal.library.readTab = vi.fn(async () => '')
  window.rehearsal.library.writeTab = vi.fn(async () => undefined)
  useSong.setState({ song: null })
  useTabs.setState({ songId: null, tabId: null, doc: newTab(6), saved: true, error: null })
  unwire = followSongForTabs()
})

afterEach(() => {
  unwire()
  vi.clearAllMocks()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('when the song changes', () => {
  it('writes what was open and lets it go', async () => {
    useSong.setState({ song: songWith('one') })
    await useTabs.getState().open('one', tab)
    useTabs.getState().edit(newTab(6))

    useSong.setState({ song: songWith('two') })
    await settle()

    expect(window.rehearsal.library.writeTab).toHaveBeenCalled()
    expect(useTabs.getState().songId).toBeNull()
  })

  /**
   * The song arriving at all is a change, and answering it takes a turn of the
   * event loop — by which time the editor has opened the file belonging to the
   * song that just arrived. Closing then drops every keystroke after it.
   */
  it('does not close a file opened while it was writing', async () => {
    useSong.setState({ song: songWith('one') })
    await useTabs.getState().open('one', tab)
    await settle()

    expect(useTabs.getState().songId).toBe('one')
    expect(useTabs.getState().tabId).toBe('tab')
  })

  it('leaves alone a song change with nothing open', async () => {
    useSong.setState({ song: songWith('one') })
    await settle()

    expect(window.rehearsal.library.writeTab).not.toHaveBeenCalled()
  })
})
