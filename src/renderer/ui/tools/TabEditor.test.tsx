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

describe('joins and chords', () => {
  it('writes a slide after the note under the cursor', () => {
    render(<TabEditor />)

    press('4')
    press('/')

    expect(strings()).toContain('-4/')
  })

  it('takes the slide off when it is typed again', () => {
    render(<TabEditor />)
    press('4')
    press('/')

    press('/')

    expect(strings()).toContain('-4-')
  })

  it('replaces one join with another', () => {
    render(<TabEditor />)
    press('4')
    press('/')

    press('^')

    expect(strings()).toContain('-4^')
  })

  it('opens the chord field on control and up', () => {
    render(<TabEditor />)

    press('ArrowUp', { ctrlKey: true })

    expect(screen.getByLabelText('Chord')).toBeTruthy()
  })

  it('writes the chord over the beat the cursor is in, and shows it', () => {
    render(<TabEditor />)
    press('ArrowUp', { ctrlKey: true })

    fireEvent.change(screen.getByLabelText('Chord'), { target: { value: 'Am' } })

    expect(drawn()).toContain('Am')
  })

  it('goes back to the tablature on escape', () => {
    render(<TabEditor />)
    press('ArrowUp', { ctrlKey: true })

    fireEvent.keyDown(screen.getByLabelText('Chord'), { key: 'Escape' })

    expect(screen.queryByLabelText('Chord')).toBeNull()
    expect(document.activeElement).toBe(sheet())
  })
})

/**
 * Whole beats, never part of one. A bar's worth of music is all six strings at
 * once, and taking the top string alone would take a shape nobody played.
 */
describe('picking out a stretch', () => {
  const picked = () => sheet().querySelectorAll('.tablature__picked')

  it('starts on the beat under the cursor', () => {
    render(<TabEditor />)

    press('s')

    /* One run of picked columns on every string. */
    expect(picked().length).toBe(6)
  })

  it('grows and shrinks with the arrows', () => {
    render(<TabEditor />)
    press('s')
    const one = (picked()[0] as HTMLElement).textContent?.length ?? 0

    press('ArrowRight')

    expect((picked()[0] as HTMLElement).textContent?.length ?? 0).toBeGreaterThan(one)
  })

  it('empties what was picked, and keeps the rest', () => {
    render(<TabEditor />)
    press('7')
    press('ArrowRight')
    press('ArrowRight')
    press('9')
    press('s')
    press('Delete')

    /* The 9 was under the cursor and is gone; the 7 two slots back is not. */
    expect(strings()).toContain('7')
    expect(strings()).not.toContain('9')
  })

  it('lets go on escape', () => {
    render(<TabEditor />)
    press('s')

    press('Escape')

    expect(picked().length).toBe(0)
  })

  it('copies and pastes a stretch', () => {
    render(<TabEditor />)
    press('7')
    press('s')
    press('c')
    for (let step = 0; step < 4; step += 1) press('ArrowRight')

    press('v')

    /* The 7 now appears twice: where it was written and where it was put. */
    expect(strings().match(/7/g)?.length).toBe(2)
  })

  it('cuts a stretch away', () => {
    render(<TabEditor />)
    press('7')
    press('s')
    press('x')

    expect(strings()).not.toContain('7')
  })
})

/**
 * A song's lead line and its rhythm part are different pieces of writing, not
 * one long one, so they are separate files listed on the song.
 */
describe('several tablatures for one song', () => {
  const twoTabs = (): Song => ({
    ...withTab(),
    tabs: [
      { id: 'lead', file: 'tabs/lead.txt', name: 'Lead', strings: 6 },
      { id: 'rhythm', file: 'tabs/rhythm.txt', name: 'Rhythm', strings: 6 }
    ]
  })

  it('offers them all to choose between', () => {
    useSong.setState({ song: twoTabs() })
    useTabs.setState({ songId: 'a-song', tabId: 'lead', file: 'tabs/lead.txt' })
    render(<TabEditor />)

    expect(screen.getByLabelText('Which tablature')).toBeTruthy()
    expect(screen.getAllByRole('option').map((one) => one.textContent)).toEqual(['Lead', 'Rhythm'])
  })

  it('adds one, and it is the one being written', async () => {
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(useSong.getState().song?.tabs).toHaveLength(2))
    expect(useSong.getState().song?.tabs[1]?.file).not.toBe(
      useSong.getState().song?.tabs[0]?.file
    )
  })

  it('renames the one being written', () => {
    render(<TabEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    fireEvent.change(screen.getByLabelText('Tablature name'), { target: { value: 'Bass' } })

    expect(useSong.getState().song?.tabs[0]?.name).toBe('Bass')
  })

  it('will not remove the only one there is', () => {
    render(<TabEditor />)

    expect(screen.getByRole('button', { name: 'Remove' })).toHaveProperty('disabled', true)
  })

  /* The entry goes; the file it was written into stays where it is. */
  it('removes one without touching what was written', () => {
    useSong.setState({
      song: twoTabs(),
      update: (patch) => useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    })
    useTabs.setState({ songId: 'a-song', tabId: 'lead', file: 'tabs/lead.txt' })
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(useSong.getState().song?.tabs.map((tab) => tab.id)).toEqual(['rhythm'])
  })
})
