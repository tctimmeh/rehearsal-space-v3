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
/* The tablature itself, without the beat numbers above it — which contain
   digits of their own and would answer for notes that are not there. */
const strings = () =>
  [...sheet().querySelectorAll('.tablature__line')]
    .map((line) => line.textContent ?? '')
    .filter((line) => line.startsWith('|'))
    .join('\n')
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

/**
 * An edit to tablature is a discrete act, so every one is its own step — with
 * one exception: the two digits of a fret are typed together and should come
 * back together.
 */
describe('taking an edit back', () => {
  const undo = () => press('z', { ctrlKey: true })
  const redo = () => press('z', { ctrlKey: true, shiftKey: true })

  it('takes back the last note', () => {
    render(<TabEditor />)
    press('7')

    undo()

    expect(strings()).not.toContain('7')
  })

  it('puts it back', () => {
    render(<TabEditor />)
    press('7')
    undo()

    redo()

    expect(drawn()).toContain('7')
  })

  it('takes back both digits of a fret at once', () => {
    render(<TabEditor />)
    press('1')
    press('2')
    expect(strings()).toContain('-12-')

    undo()

    expect(strings()).not.toMatch(/[0-9]/)
  })

  it('does nothing at the beginning', () => {
    render(<TabEditor />)
    const before = drawn()

    undo()

    expect(drawn()).toBe(before)
  })

  it('takes back a note that was deleted', () => {
    render(<TabEditor />)
    press('9')
    press('Backspace')

    undo()

    expect(drawn()).toContain('9')
  })
})

describe('rhythm', () => {
  it('makes room for a sixteenth on shift and right', () => {
    render(<TabEditor />)

    press('ArrowRight', { shiftKey: true })
    press('9')

    /* Beat one now reads 1 e &, and the 9 is on the e. */
    expect(drawn()).toContain('1 e &')
    expect(strings()).toContain('-9-')
  })

  it('makes room to the left as well', () => {
    render(<TabEditor />)

    press('ArrowRight')
    press('ArrowLeft', { shiftKey: true })
    press('4')

    expect(drawn()).toContain('1 e &')
    expect(strings()).toContain('-4-')
  })

  it('closes the gap again once the cursor leaves and nothing was written', () => {
    render(<TabEditor />)
    press('ArrowRight', { shiftKey: true })
    expect(drawn()).toContain('1 e &')

    for (let step = 0; step < 3; step += 1) press('ArrowRight')

    expect(drawn()).not.toContain('1 e &')
  })

  it('changes how many beats the bar is in', () => {
    render(<TabEditor />)

    press('ArrowRight', { ctrlKey: true })
    press('ArrowRight', { ctrlKey: true })

    expect(drawn()).toContain('6')
  })

  it('will not go below three', () => {
    render(<TabEditor />)

    for (let step = 0; step < 6; step += 1) press('ArrowLeft', { ctrlKey: true })

    expect(drawn()).toContain('3')
    expect(drawn()).not.toContain('4')
  })

  it('can be taken back like anything else', () => {
    render(<TabEditor />)
    press('ArrowRight', { shiftKey: true })
    press('9')

    press('z', { ctrlKey: true })
    press('z', { ctrlKey: true })

    expect(drawn()).not.toContain('1 e &')
  })
})
