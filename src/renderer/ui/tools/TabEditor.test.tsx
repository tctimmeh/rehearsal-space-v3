// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { newTab } from '@core/tab/document'
import { useSong } from '@renderer/state/song'
import { useTabs } from '@renderer/state/tabs'
import { installBridge } from '@renderer/testing/bridge'
import { installResizeObserver } from '@renderer/testing/resize'
import { TabEditor } from './TabEditor'

const withTab = (): Song => ({
  ...newSong('a-song'),
  id: 'a-song',
  tabs: [{ id: 'tab', file: 'tabs/tab.txt', name: 'Tab', strings: 6 }]
})

beforeEach(() => {
  installBridge()
  installResizeObserver()
  window.rehearsal.library.readTab = vi.fn(async () => '')
  window.rehearsal.library.writeTab = vi.fn(async () => undefined)
  useSong.setState({
    song: withTab(),
    songs: [],
    error: null,
    importing: false,
    update: (patch) => useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
  })
  useTabs.setState({
    songId: 'a-song',
    tabId: 'tab',
    file: 'tabs/tab.txt',
    doc: newTab(6),
    revision: 0,
    saved: true
  })
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null })
  vi.clearAllMocks()
})

const sheet = () => screen.getByRole('textbox', { name: /Tablature/ })
const drawn = () => sheet().textContent ?? ''
const press = (key: string, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(sheet(), { key, ...init })

describe('writing a fret', () => {
  it('puts it under the cursor', () => {
    render(<TabEditor />)

    press('7')

    expect(drawn()).toContain('-7-')
  })

  /* The cursor stays put, so a second digit lengthens the number rather than
     landing on the next slot. */
  it('makes one number of two digits typed together', () => {
    render(<TabEditor />)

    press('1')
    press('2')

    expect(drawn()).toContain('-12-')
  })

  it('writes a mute where a fret would go', () => {
    render(<TabEditor />)

    press('x')

    expect(drawn()).toContain('-x-')
  })

  it('takes it away again', () => {
    render(<TabEditor />)
    press('7')

    press('Backspace')

    expect(drawn()).not.toContain('7')
  })

  it('writes on the string the cursor is on', () => {
    render(<TabEditor />)

    press('ArrowDown')
    press('ArrowDown')
    press('5')

    /* The third string down, which is the third row of tablature — under the
       chordless beat-marker line. */
    const rows = [...sheet().querySelectorAll('.tablature__line')].map((line) => line.textContent ?? '')
    const strings = rows.filter((row) => row.startsWith('|'))
    expect(strings[2]).toContain('5')
    expect(strings[0]).not.toContain('5')
  })
})

describe('what it saves', () => {
  it('writes the tab to the song\'s own folder', async () => {
    render(<TabEditor />)

    press('9')
    await waitFor(() => expect(useTabs.getState().saved).toBe(false))
    await useTabs.getState().flush()

    expect(window.rehearsal.library.writeTab).toHaveBeenCalledWith(
      'a-song',
      'tabs/tab.txt',
      expect.stringContaining('9')
    )
  })
})

/**
 * The app's own keys are global, and this editor is not a text field — it is a
 * focusable div, which nothing else would recognise as somewhere a keystroke
 * is being typed. Without the marker on it, space plays the song while
 * somebody is writing a bar.
 */
describe('the app\'s keys, while typing here', () => {
  it('says it is being typed into', () => {
    render(<TabEditor />)

    expect(sheet().dataset['typing']).toBe('true')
  })
})

describe('a song with no tablature yet', () => {
  it('offers to start one', () => {
    useSong.setState({ song: { ...newSong('a-song'), id: 'a-song', tabs: [] } })
    render(<TabEditor />)

    expect(screen.getByRole('button', { name: 'Start a tab' })).toBeTruthy()
  })

  it('gives the song one when asked', () => {
    useSong.setState({
      song: { ...newSong('a-song'), id: 'a-song', tabs: [] },
      update: (patch) => useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    })
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Start a tab' }))

    expect(useSong.getState().song?.tabs).toHaveLength(1)
  })
})

/**
 * jsdom has no layout, so a click cannot be aimed by pixel here. What can be
 * held to is that the sheet offers the lines to aim at, and that a click on
 * one of them moves the cursor to it rather than being ignored.
 */
describe('pointing at the tablature', () => {
  it('offers every line to be aimed at', () => {
    render(<TabEditor />)

    const rows = [...sheet().querySelectorAll('.tablature__line')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.getAttribute('data-line')).not.toBeNull()
  })

  it('draws a system at a time, so scrolling can think in whole bars', () => {
    render(<TabEditor />)

    expect(sheet().querySelectorAll('.tablature__system').length).toBeGreaterThan(0)
  })

  it('takes the focus when clicked, so typing goes here', () => {
    render(<TabEditor />)
    const row = sheet().querySelector('.tablature__line') as HTMLElement

    fireEvent.pointerDown(row, { clientX: 0 })

    expect(document.activeElement).toBe(sheet())
  })
})
