// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { newTab } from '@core/tab/document'
import { AT_START, chordAt } from '@core/tab/edit'
import { TAB_KEY_COUNT } from '@core/tab/keys'
import { useSong } from '@renderer/state/song'
import { useTabs } from '@renderer/state/tabs'
import { useTools } from '@renderer/state/tools'
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

  it('does not save because the cursor moved', async () => {
    await useTabs.getState().open('a-song', {
      id: 'tab',
      file: 'tabs/tab.txt',
      name: 'Tab',
      strings: 6
    })
    render(<TabEditor />)
    vi.clearAllMocks()

    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'ArrowRight']) {
      press(key)
    }
    await useTabs.getState().flush()

    expect(useTabs.getState().saved).toBe(true)
    expect(window.rehearsal.library.writeTab).not.toHaveBeenCalled()
  })

  it('still saves the sixteenth that closes up as the cursor leaves the beat', async () => {
    render(<TabEditor />)
    press('ArrowRight', { shiftKey: true })
    press('9')
    await useTabs.getState().flush()
    vi.clearAllMocks()

    press('Delete')
    press('ArrowDown')
    await useTabs.getState().flush()

    expect(window.rehearsal.library.writeTab).toHaveBeenCalled()
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
  /*
   * The chord is named where it will be read. It used to be typed into a box
   * above the editor, which meant looking away from the bar being named.
   */
  it('opens the field inside the tablature, not above it', () => {
    render(<TabEditor />)
    sheet().focus()

    press('ArrowUp', { ctrlKey: true })

    const box = screen.getByLabelText('Chord')
    expect(sheet().contains(box)).toBe(true)
    expect(box.closest('.tablature__system')).toBeTruthy()
    /* A bar opens with a pipe and a dash, so its first slot is column two. */
    expect((box as HTMLElement).style.left).toBe('2ch')
  })

  it('stands it over the beat it names', () => {
    render(<TabEditor />)
    sheet().focus()
    /* Onto the third beat, which is four slots along. */
    for (let step = 0; step < 4; step += 1) press('ArrowRight')

    press('ArrowUp', { ctrlKey: true })

    const box = screen.getByLabelText('Chord') as HTMLElement
    /* Counted in characters of the drawing, which is what a `ch` is. */
    expect(box.style.left).toMatch(/^\d+ch$/)
    expect(Number.parseFloat(box.style.left)).toBeGreaterThan(0)
  })

  /* The sheet answers for every key it is given, and these are the field's. */
  it('lets a chord be spelled without the letters doing something else', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('ArrowUp', { ctrlKey: true })

    await user.type(screen.getByLabelText('Chord'), 'Asus4')

    expect(chordAt(useTabs.getState().doc, AT_START)).toBe('Asus4')
    expect(sheet().querySelectorAll('.tablature__picked').length).toBe(0)
  })

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

  it('writes a staccato on the note under the cursor', () => {
    render(<TabEditor />)

    press('4')
    press('.')

    expect(strings()).toContain('-4.')
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
    press('c', { ctrlKey: true })
    for (let step = 0; step < 4; step += 1) press('ArrowRight')

    press('v', { ctrlKey: true })

    /* The 7 now appears twice: where it was written and where it was put. */
    expect(strings().match(/7/g)?.length).toBe(2)
  })

  it('cuts a stretch away', () => {
    render(<TabEditor />)
    press('7')
    press('s')

    press('x', { ctrlKey: true })

    expect(strings()).not.toContain('7')
    expect(strings()).not.toContain('x')
  })

  /*
   * The plain letters are a fret's worth of typing. `x` is a muted string, and
   * taking it for "cut" while beats were picked out made it the one place in
   * the app where a bare letter threw music away.
   */
  it('types a mute rather than cutting when x is pressed on its own', () => {
    render(<TabEditor />)
    press('7')
    press('s')

    press('x')

    expect(strings()).toContain('x')
    expect(picked().length).toBe(0)
  })

  it('does nothing for a plain c or v', () => {
    render(<TabEditor />)
    press('7')
    press('s')
    press('c')
    for (let step = 0; step < 4; step += 1) press('ArrowRight')

    press('v')

    expect(strings().match(/7/g)?.length).toBe(1)
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

    const picker = screen.getByLabelText('Which tablature')
    expect(within(picker).getAllByRole('option').map((one) => one.textContent)).toEqual([
      'Lead',
      'Rhythm'
    ])
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

  /* A song that should never have had one is a song that can be rid of it. */
  it('removes the only one there is, offering to start another', async () => {
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

    expect(useSong.getState().song?.tabs).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Start a tab' })).toBeTruthy()
    /* And nothing is left holding the file that is no longer listed. */
    await waitFor(() => expect(useTabs.getState().tabId).toBeNull())
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

/**
 * While beats are picked out there is no cursor drawn — so anything that looks
 * like asking for the cursor has to let go of the selection, or the editor
 * appears to have stopped responding.
 */
describe('getting out of choosing beats', () => {
  const picked = () => sheet().querySelectorAll('.tablature__picked')

  it('lets go when s is pressed again', () => {
    render(<TabEditor />)
    press('s')
    expect(picked().length).toBe(6)

    press('s')

    expect(picked().length).toBe(0)
  })

  it('does not start choosing again in the same breath', () => {
    render(<TabEditor />)
    press('s')

    press('s')
    press('s')

    /* Off, on: an odd number of presses leaves it choosing, not off. */
    expect(picked().length).toBe(6)
  })

  it('lets go when the tablature is clicked', () => {
    render(<TabEditor />)
    press('s')

    fireEvent.pointerDown(sheet().querySelector('.tablature__line') as HTMLElement, { clientX: 0 })

    expect(picked().length).toBe(0)
  })

  it('shows the cursor again once it has let go', () => {
    render(<TabEditor />)
    press('s')
    expect(sheet().querySelectorAll('.tablature__cursor').length).toBe(0)

    press('s')

    expect(sheet().querySelectorAll('.tablature__cursor').length).toBe(1)
  })
})

describe('weighting what matters', () => {
  const inked = (className: string) =>
    [...sheet().querySelectorAll(className)].map((one) => one.textContent ?? '')

  it('draws a fret as a note and the dashes around it as neither', () => {
    render(<TabEditor />)
    press('7')

    expect(inked('.tablature__note')).toEqual(['7'])
  })

  it('keeps both digits of a two-digit fret in one note', () => {
    render(<TabEditor />)
    press('1')
    press('2')
    /* Out from under the cursor, which otherwise takes the digit it stands on
       for its own and splits the number in two. */
    press('ArrowRight')

    expect(inked('.tablature__note')).toEqual(['12'])
  })

  it('marks the bar lines, and does not confuse them with what is between them', () => {
    render(<TabEditor />)

    expect(inked('.tablature__bar').every((one) => /^\|+$/.test(one))).toBe(true)
    expect(inked('.tablature__bar').length).toBeGreaterThan(0)
  })

  it('marks the count above the strings, and the sixteenths apart from it', () => {
    render(<TabEditor />)
    /* Opening a sixteenth is what puts an `e` on the marker line, alongside
       the `&` of the eighth it was opened against. */
    press('ArrowRight', { shiftKey: true })

    expect(inked('.tablature__beat')).toContain('1')
    expect(inked('.tablature__sub')).toEqual(['e'])
    /* The eighth is not a sixteenth and is not dimmed with them. */
    expect(drawn()).toContain('&')
    expect(inked('.tablature__sub')).not.toContain('&')
  })

  it('leaves the cursor its own colour where it stands on a note', () => {
    render(<TabEditor />)
    press('9')

    const cursor = sheet().querySelector('.tablature__cursor') as HTMLElement
    expect(cursor.textContent).toBe('9')
    expect(cursor.classList.contains('tablature__note')).toBe(true)
  })
})

/*
 * Every key lands in the editor while it has the cursor, the app's own keys
 * included, so there has to be a way of putting it down that is not reaching
 * for the mouse.
 */
describe('stepping out of the tablature', () => {
  it('lets go of the cursor on Escape', () => {
    render(<TabEditor />)
    sheet().focus()
    expect(document.activeElement).toBe(sheet())

    press('Escape')

    expect(document.activeElement).not.toBe(sheet())
  })

  /* Escape has a nearer job while beats are picked out, and does that first. */
  it('leaves the selection first, and keeps the cursor', () => {
    render(<TabEditor />)
    sheet().focus()
    press('s')

    press('Escape')

    expect(sheet().querySelectorAll('.tablature__picked').length).toBe(0)
    expect(document.activeElement).toBe(sheet())
  })

  it('lets go on a second Escape, once there is nothing left to leave', () => {
    render(<TabEditor />)
    sheet().focus()
    press('s')

    press('Escape')
    press('Escape')

    expect(document.activeElement).not.toBe(sheet())
  })
})

/*
 * The way back in. Escape puts the editor down; with nothing else on screen
 * answering for the key, the next one picks it up again.
 */
describe('coming back to the tablature', () => {
  const escapeAnywhere = (init: KeyboardEventInit = {}) =>
    fireEvent.keyDown(document.body, { key: 'Escape', ...init })

  it('takes the cursor back when nothing else answered the press', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('Escape')
    expect(document.activeElement).not.toBe(sheet())

    escapeAnywhere()

    await waitFor(() => expect(document.activeElement).toBe(sheet()))
  })

  /* Something closing on the same press has the better claim to it: the
     tablature is still there to come back to afterwards. */
  it('leaves the press alone when something else answered it', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('Escape')

    const answering = (event: KeyboardEvent) => event.preventDefault()
    window.addEventListener('keydown', answering)
    escapeAnywhere()
    window.removeEventListener('keydown', answering)

    await new Promise((done) => setTimeout(done))
    expect(document.activeElement).not.toBe(sheet())
  })

  /* Somebody typing elsewhere is not asking for the cursor to be taken away,
     whether or not the field they are in has any use for the key. */
  it('does not take the cursor out of a field', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('Escape')
    const elsewhere = document.body.appendChild(document.createElement('textarea'))
    elsewhere.focus()

    fireEvent.keyDown(elsewhere, { key: 'Escape' })

    await new Promise((done) => setTimeout(done))
    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })
})

describe('renaming a tablature', () => {
  /*
   * The field stands where the picker stood, in the row. It borrowed the
   * chord field's class, and when that moved onto the staff and became
   * absolutely positioned the rename box went with it — over the top of the
   * tool's own title.
   */
  it('stands in the row rather than over whatever is above it', () => {
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    const field = screen.getByLabelText('Tablature name').closest('label') as HTMLElement
    expect(field.className).toContain('tablature__pick')
    expect(field.className).not.toContain('tablature__chord')
  })

  it('picks the name out, ready to be typed over', () => {
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    const field = screen.getByLabelText('Tablature name') as HTMLInputElement
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Tab'.length)
  })
})

/*
 * The editor has no buttons for what it does — there is no button for typing a
 * fret — so the keys have to be written down somewhere the editor can show.
 */
describe('the list of what the editor answers to', () => {
  it('is not a line of prose in the way of the controls', () => {
    render(<TabEditor />)

    expect(screen.queryByText(/to name the chord/)).toBeNull()
  })

  it('opens from the button beside the saved indicator', () => {
    render(<TabEditor />)

    fireEvent.click(screen.getByRole('button', { name: 'Tablature keys' }))

    expect(screen.getByText('Tablature keys')).toBeTruthy()
    expect(screen.getByText('Name the chord over this beat')).toBeTruthy()
  })

  it('accounts for every key it lists', () => {
    render(<TabEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Tablature keys' }))

    expect(screen.getAllByRole('term')).toHaveLength(TAB_KEY_COUNT)
  })

  /* Closing hands the cursor back, or the next fret typed would go nowhere. */
  it('gives the tablature the cursor back when it closes', () => {
    render(<TabEditor />)
    sheet().focus()
    fireEvent.click(screen.getByRole('button', { name: 'Tablature keys' }))

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(document.activeElement).toBe(sheet())
  })
})

/* A song may hold a guitar part and a bass part, so the instrument belongs to
   the file rather than to the app. */
describe('how many strings a tablature is for', () => {
  const pick = (count: number) =>
    fireEvent.change(screen.getByLabelText('Strings'), { target: { value: String(count) } })

  it('offers a bass through to an eight-string', () => {
    render(<TabEditor />)

    expect(
      within(screen.getByLabelText('Strings'))
        .getAllByRole('option')
        .map((one) => one.textContent)
    ).toEqual(['4', '5', '6', '7', '8'])
  })

  it('starts on the six a guitar has', () => {
    render(<TabEditor />)

    expect((screen.getByLabelText('Strings') as HTMLSelectElement).value).toBe('6')
  })

  it('draws the tablature on as many lines as are asked for', () => {
    render(<TabEditor />)

    pick(4)

    expect(strings().split('\n')).toHaveLength(4)
  })

  it('notes it on the song, so the next file started here is the same', async () => {
    render(<TabEditor />)

    pick(4)

    await waitFor(() => expect(useSong.getState().song?.tabs[0]?.strings).toBe(4))
  })

  it('writes it to the file that way', async () => {
    render(<TabEditor />)

    pick(7)
    await useTabs.getState().flush()

    const written = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(written.trim().split('\n').filter((line) => line.startsWith('|'))).toHaveLength(7)
  })

  /* The cursor cannot stand on a string that is no longer there, and would be
     drawn nowhere at all if it tried. */
  it('brings the cursor up off a string that has gone', () => {
    render(<TabEditor />)
    for (let step = 0; step < 5; step += 1) press('ArrowDown')

    pick(4)

    expect(sheet().querySelectorAll('.tablature__cursor').length).toBe(1)
  })

  it('takes what was written on that string with it', () => {
    render(<TabEditor />)
    for (let step = 0; step < 5; step += 1) press('ArrowDown')
    press('9')
    expect(strings()).toContain('9')

    pick(4)

    expect(strings()).not.toContain('9')
  })

  it('leaves alone what was written on a string that stays', () => {
    render(<TabEditor />)
    press('7')

    pick(4)

    expect(strings().split('\n')[0]).toContain('7')
  })
})

/*
 * A tablature file is not one long run of bars: it has a verse, a chorus, and
 * things worth saying about how to play them. The words divide it.
 */
describe('sections divided by words', () => {
  const words = () => screen.queryByLabelText('Section words') as HTMLTextAreaElement | null
  /** How many bars the nth system holds, counted from the pipes on a row. */
  const bars = (system: number) => {
    const rows = [...sheet().querySelectorAll('.tablature__system')][system]
    const row = rows?.querySelector('.tablature__line[data-line]:last-child')
    return ((row?.textContent ?? '').match(/\|/g)?.length ?? 1) - 1
  }
  const written = () =>
    [...sheet().querySelectorAll('.tablature__words')].map((one) => one.textContent)

  it('opens one at the cursor, ready to be named', () => {
    render(<TabEditor />)
    sheet().focus()

    press('t', { ctrlKey: true })

    expect(words()).toBeTruthy()
    expect(document.activeElement).toBe(words())
  })

  it('writes what is typed there above that bar', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })

    await user.type(words() as HTMLTextAreaElement, 'Chorus:')

    expect(useTabs.getState().doc.bars[0]?.opens).toBe('Chorus:')
  })

  it('saves the words to the file, above the bars they introduce', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')
    await useTabs.getState().flush()

    const file = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(file.split('\n')[0]).toBe('Verse:')
  })

  /* Two presses of the same key must not throw away what was written. */
  it('leaves a section that is already open alone', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Intro')

    press('t', { ctrlKey: true })

    expect(useTabs.getState().doc.bars[0]?.opens).toBe('Intro')
  })

  it('goes up from the top string into the words', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })
    expect(document.activeElement).toBe(sheet())

    press('ArrowUp')

    expect(document.activeElement).toBe(words())
  })

  it('comes back down into the music below them', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')

    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(sheet())
    expect(sheet().querySelectorAll('.tablature__cursor').length).toBe(1)
  })

  /* An unnamed section is not a section, so the systems either side re-join. */
  it('closes again when the words are all deleted and the cursor leaves', () => {
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    expect(useTabs.getState().doc.bars[0]?.opens).toBe('')

    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'ArrowDown' })

    expect(useTabs.getState().doc.bars[0]?.opens).toBeUndefined()
    expect(written()).toHaveLength(0)
  })

  /*
   * A section opened part-way through leaves the one above it a bar to carry
   * on in, which puts a bar in front of the one being opened. The words go
   * above the bar that moved, not the one put in front of it.
   */
  it('opens the section on the right bar when room is made above it', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('7')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')

    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Chorus:')

    const doc = useTabs.getState().doc
    const at = doc.bars.findIndex((bar) => bar.opens !== undefined)
    expect(at).toBeGreaterThan(0)
    expect(doc.bars[at]?.opens).toBe('Chorus:')
  })

  it('leaves the section above it an empty bar to carry on in', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')

    press('t', { ctrlKey: true })

    const doc = useTabs.getState().doc
    const at = doc.bars.findIndex((bar) => bar.opens !== undefined)
    expect(doc.bars[at - 1]?.opens).toBeUndefined()
    expect(strings().split('\n')[0]?.match(/\|/g)?.length).toBeGreaterThan(2)
  })

  it('takes the caret when the words are clicked', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })
    expect(document.activeElement).toBe(sheet())

    await user.click(words() as HTMLTextAreaElement)

    expect(document.activeElement).toBe(words())
  })

  /*
   * Clicking from one section's words into another's leaves the first, and
   * leaving settles the document. Settling that changes nothing must not hand
   * back a cursor as though it had moved: the sheet scrolls to wherever the
   * block cursor stands, which would drag the page away from the words just
   * clicked.
   */
  it('stays where it was clicked rather than scrolling to the block cursor', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })
    for (let step = 0; step < 8; step += 1) press('ArrowRight')
    press('t', { ctrlKey: true })
    const second = document.activeElement as HTMLTextAreaElement
    await user.type(second, 'Chorus:')
    fireEvent.keyDown(second, { key: 'Escape' })
    const both = screen.getAllByLabelText('Section words')
    expect(both).toHaveLength(2)
    await user.click(both[1] as HTMLTextAreaElement)
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled

    await user.click(both[0] as HTMLTextAreaElement)

    expect(document.activeElement).toBe(both[0])
    expect(scrolled).not.toHaveBeenCalled()
  })

  /* The words sit inside the sheet, whose own click handler places the block
     cursor from the row that was nearest. It must keep out of the words. */
  it('does not move the cursor in the music when the words are clicked', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Verse:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'ArrowDown' })
    for (let step = 0; step < 3; step += 1) press('ArrowRight')
    const before = sheet().querySelector('.tablature__cursor')?.textContent

    await user.click(words() as HTMLTextAreaElement)
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })

    expect(sheet().querySelector('.tablature__cursor')?.textContent).toBe(before)
  })

  /* Up out of the words is upwards: into the music above them, not back into
     the music they introduce. */
  it('goes up out of the words into the system above them', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('7')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Chorus:')

    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'ArrowUp' })

    const lines = [...sheet().querySelectorAll('.tablature__line')]
    const cursorAt = lines.findIndex((line) => line.querySelector('.tablature__cursor'))
    const wordsAt = [...sheet().children].findIndex((one) =>
      one.classList.contains('tablature__words')
    )
    const linesBeforeWords = [...sheet().children]
      .slice(0, wordsAt)
      .reduce((count, one) => count + one.querySelectorAll('.tablature__line').length, 0)
    expect(cursorAt).toBeLessThan(linesBeforeWords)
  })

  /*
   * A section keeps one spare bar, the way the end of the file does. Emptying
   * the last bar of one leaves two, and the second is room nobody asked for.
   */
  it('closes up spare bars left at the end of a section', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('7')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')
    press('9')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Chorus:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })
    /* Two bars of music and the spare that opening a section left behind. */
    expect(bars(0)).toBe(3)

    /* Back to the 9 and take it away, which leaves that bar spare too. Walked
       by where the cursor is rather than by a count of presses: the column a
       bar opens with is a place it stops now, so crossing a bar line takes one
       step more than it used to. */
    for (
      let step = 0;
      step < 40 && sheet().querySelector('.tablature__cursor')?.textContent !== '9';
      step += 1
    ) {
      press('ArrowLeft')
    }
    press('Delete')
    press('ArrowLeft')

    expect(strings()).not.toContain('9')
    expect(bars(0)).toBe(2)
  })

  it('shows the words above the section once they are written', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    press('t', { ctrlKey: true })
    await user.type(words() as HTMLTextAreaElement, 'Chorus:')
    fireEvent.keyDown(words() as HTMLTextAreaElement, { key: 'Escape' })

    expect(written()).toEqual(['Chorus:'])
  })
})

/* What the picking hand is doing, drawn between the beats and the strings. */
describe('palm mutes and vibrato', () => {
  const hand = () =>
    [...sheet().querySelectorAll('.tablature__line[data-line]')]
      .map((line) => line.textContent ?? '')
      .find((line) => line.trim() !== '' && /^[ x~]+$/.test(line))

  it('damps the note under the cursor', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')

    press('p')

    expect(hand()?.trim()).toBe('x')
  })

  it('lets it ring again when pressed twice', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('p')

    press('p')

    expect(hand()).toBeUndefined()
  })

  it('shakes the note by half a beat at a time', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')

    press('v')
    expect(hand()?.trim()).toBe('~')

    press('v')
    expect(hand()?.trim()).toBe('~~~')

    press('v')
    expect(hand()?.trim()).toBe('~~~~~')
  })

  it('takes half a beat back off with shift', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('v')
    press('v')

    press('v', { shiftKey: true })

    expect(hand()?.trim()).toBe('~')
  })

  it('stops at none rather than going negative', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('v')

    press('v', { shiftKey: true })
    press('v', { shiftKey: true })

    expect(hand()).toBeUndefined()
  })

  it('writes them to the file', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('p')
    await useTabs.getState().flush()

    const file = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(file.split('\n').some((line) => /^[ x~]+$/.test(line) && line.includes('x'))).toBe(true)
  })
})

/* A repeat begins at the left-hand line of a bar and ends at the right-hand
   line, so which half the cursor is in says which one is meant. */
describe('repeats', () => {
  const staff = () => strings().split('\n')
  const times = () => screen.queryByLabelText('Times round') as HTMLInputElement | null

  it('begins one from the first half of the bar', () => {
    render(<TabEditor />)
    sheet().focus()

    press('r', { ctrlKey: true })

    expect(staff()[0]?.startsWith('||')).toBe(true)
    expect(useTabs.getState().doc.bars[0]?.repeatStart).toBe(true)
  })

  it('takes it off again when pressed twice', () => {
    render(<TabEditor />)
    sheet().focus()
    press('r', { ctrlKey: true })

    press('r', { ctrlKey: true })

    expect(useTabs.getState().doc.bars[0]?.repeatStart).toBeUndefined()
  })

  it('ends one from the last half, and asks how many times round', () => {
    render(<TabEditor />)
    sheet().focus()
    /* Onto beat three, which is the second half of a four-beat bar. */
    for (let step = 0; step < 4; step += 1) press('ArrowRight')

    press('r', { ctrlKey: true })

    expect(useTabs.getState().doc.bars[0]?.repeatTimes).toBe(1)
    expect(times()).toBeTruthy()
    expect(document.activeElement).toBe(times())
  })

  it('says nothing above a plain repeat', () => {
    render(<TabEditor />)
    sheet().focus()
    for (let step = 0; step < 4; step += 1) press('ArrowRight')
    press('r', { ctrlKey: true })

    fireEvent.keyDown(times() as HTMLInputElement, { key: 'Enter' })

    expect(drawn()).not.toContain('x1')
  })

  it('writes how many times round when it is more than once', () => {
    render(<TabEditor />)
    sheet().focus()
    for (let step = 0; step < 4; step += 1) press('ArrowRight')
    press('r', { ctrlKey: true })

    fireEvent.change(times() as HTMLInputElement, { target: { value: '12' } })

    expect(drawn()).toContain('x12')
  })

  /* Typing digit by digit over the number already there. Reading the field's
     value back off the document put it back between keystrokes, and 12 typed
     over a selected 1 arrived as 112. */
  it('takes the digits as they are typed rather than adding to what was there', async () => {
    const user = userEvent.setup()
    render(<TabEditor />)
    sheet().focus()
    for (let step = 0; step < 4; step += 1) press('ArrowRight')
    press('r', { ctrlKey: true })

    await user.clear(times() as HTMLInputElement)
    await user.type(times() as HTMLInputElement, '12')

    expect(useTabs.getState().doc.bars[0]?.repeatTimes).toBe(12)
    expect((times() as HTMLInputElement).value).toBe('12')
  })

  /* The key that made it takes it off, which is what somebody who has just
     pressed it by mistake reaches for. */
  it('takes the repeat off when the same key is pressed in the count', () => {
    render(<TabEditor />)
    sheet().focus()
    for (let step = 0; step < 4; step += 1) press('ArrowRight')
    press('r', { ctrlKey: true })
    expect(useTabs.getState().doc.bars[0]?.repeatTimes).toBe(1)

    fireEvent.keyDown(times() as HTMLInputElement, { key: 'r', ctrlKey: true })

    expect(useTabs.getState().doc.bars[0]?.repeatTimes).toBeUndefined()
    expect(times()).toBeNull()
    expect(document.activeElement).toBe(sheet())
  })

  it('takes the repeat off when nought times is asked for', () => {
    render(<TabEditor />)
    sheet().focus()
    for (let step = 0; step < 4; step += 1) press('ArrowRight')
    press('r', { ctrlKey: true })

    fireEvent.change(times() as HTMLInputElement, { target: { value: '0' } })

    expect(useTabs.getState().doc.bars[0]?.repeatTimes).toBeUndefined()
  })

  it('writes the marks to the file', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('r', { ctrlKey: true })
    await useTabs.getState().flush()

    const file = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(file).toContain('||')
    expect(file).toContain(':')
  })
})

/*
 * The tablature is all keyboard, so opening it puts the cursor in it. A song
 * arriving underneath one that was already open is a different thing: whoever
 * loaded it wants to press play, and the space bar that starts the music
 * would otherwise be typed into a bar.
 */
describe('who gets the cursor', () => {
  const opened = (justOpened: 'tab' | null) => useTools.setState({ justOpened })

  afterEach(() => opened(null))

  it('takes it when the tool is the thing that was just opened', () => {
    opened('tab')

    render(<TabEditor />)

    expect(document.activeElement).toBe(sheet())
  })

  it('leaves it alone when a song brought the tool back with it', () => {
    opened(null)

    render(<TabEditor />)

    expect(document.activeElement).not.toBe(sheet())
  })

  /*
   * As a song load really arrives: the tool is drawn first and which file is
   * open lands a moment later. That second arrival is the tool settling, and
   * mistaking it for somebody choosing a file is what took the cursor.
   */
  it('leaves it alone when the file arrives after the tool is drawn', async () => {
    opened(null)
    useTabs.setState({ songId: null, tabId: null, file: null })

    render(<TabEditor />)
    await waitFor(() => expect(useTabs.getState().tabId).toBe('tab'))

    expect(document.activeElement).not.toBe(sheet())
  })

  /* Loading another song while the tool is open is the same thing again. */
  it('leaves it alone when another song arrives underneath it', async () => {
    opened('tab')
    render(<TabEditor />)
    expect(document.activeElement).toBe(sheet())
    sheet().blur()

    useSong.setState({
      song: {
        ...withTab(),
        id: 'another-song',
        tabs: [{ id: 'tab', file: 'tabs/tab.txt', name: 'Tab', strings: 6 }]
      }
    })
    await waitFor(() => expect(useSong.getState().song?.id).toBe('another-song'))

    expect(document.activeElement).not.toBe(sheet())
  })
})

/*
 * A bend says the note is bent and a release that it comes back down. How far
 * is deliberately not written: the column after a note is all the room there
 * is, and everything tried for an amount cost more than it was worth.
 */
describe('bends', () => {
  it('marks a note as bent', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')

    press('b')

    expect(strings()).toContain('-7b-')
  })

  it('marks it off again', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('b')

    press('b')

    expect(strings()).not.toContain('b')
  })

  it('releases a bend back down', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('b')
    press('ArrowRight')

    press('r')

    expect(strings()).toContain('-7b-r')
  })

  /* Which string bends is never in doubt, which a row above the staff could
     not have said. */
  it('bends the string the cursor is on and no other', () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowDown')
    press('7')

    press('b')

    const rows = strings().split('\n')
    expect(rows[1]).toContain('7b')
    expect(rows[0]).not.toContain('b')
  })

  /* The whole reason for writing it in the column that is already there. */
  it('does not make the bar any wider', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    const before = strings().split('\n')[0]?.length

    press('b')

    expect(strings().split('\n')[0]?.length).toBe(before)
  })

  it('writes it to the file', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('b')

    await useTabs.getState().flush()

    const written = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(written).toContain('7b')
  })
})

/*
 * A technique says what happens coming out of the note it follows, so what
 * happens coming *into* one is written in the column before it. The first note
 * of a bar has no column before it inside the bar — it has the one the bar
 * opens with, and the cursor can now sit there.
 */
describe('a technique before the first beat', () => {
  it('steps left out of the first beat onto the opening column', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')

    press('ArrowLeft')
    press('/')

    expect(strings()).toContain('|/7-')
  })

  it('comes back to the note again', () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowLeft')

    press('ArrowRight')
    press('7')

    expect(strings()).toContain('|-7-')
  })

  /* A pre-bend, released down to the note it is struck on. */
  it('writes a release into the note', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('ArrowLeft')

    press('r')

    expect(strings()).toContain('|r7-')
  })

  it('takes it off again when it is typed twice', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('ArrowLeft')
    press('/')

    press('/')

    expect(strings()).toContain('|-7-')
  })

  /* There is no note there to write, and a keystroke that means nothing should
     do nothing rather than something surprising. */
  it('ignores a fret typed where there is no slot', () => {
    render(<TabEditor />)
    sheet().focus()
    const before = strings()

    press('ArrowLeft')
    press('9')

    expect(strings()).toBe(before)
  })

  it('does not make the bar any wider', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    press('ArrowLeft')
    /* Measured after the cursor has moved: settling is what adds the empty bar
       to carry on in, and that is not what this is about. */
    const before = strings().split('\n')[0]?.length

    press('/')

    expect(strings().split('\n')[0]?.length).toBe(before)
  })
})

/*
 * A beat in threes is three notes in the time of two. Six is the beat split at
 * its `&` with each half in threes, which is what a sixteenth triplet is, and
 * three notes across two beats is both beats in threes.
 */
describe('triplets', () => {
  /* The beat numbers and whatever is written between them. */
  const marks = () =>
    [...sheet().querySelectorAll('.tablature__line')]
      .map((line) => line.textContent ?? '')
      .find((line) => /\d/.test(line) && !line.startsWith('|')) ?? ''

  it('puts the beat in threes', () => {
    render(<TabEditor />)
    sheet().focus()

    press('t')
    press('1')
    press('ArrowRight')
    press('2')
    press('ArrowRight')
    press('3')

    expect(strings()).toContain('-1-2-3-')
  })

  /* Nothing is written over a beat in threes: three notes evenly spaced
     between two beat numbers can be nothing else. */
  it('writes nothing above it', () => {
    render(<TabEditor />)
    sheet().focus()

    press('t')

    expect(marks()).not.toContain('e')
    expect(marks()).not.toContain('&')
  })

  it('goes on to sixes, which keep the ampersand', () => {
    render(<TabEditor />)
    sheet().focus()

    press('t')
    press('t')

    expect(marks()).toContain('&')
    expect(marks()).not.toContain('e')
  })

  it('comes back to halves', () => {
    render(<TabEditor />)
    sheet().focus()
    const before = strings().split('\n')[0]

    press('t')
    press('t')
    press('t')

    expect(strings().split('\n')[0]).toBe(before)
  })

  it('keeps a note that was already there', () => {
    render(<TabEditor />)
    sheet().focus()
    press('7')

    press('t')

    expect(strings()).toContain('-7-')
  })

  /* Three notes across two beats: the quarter-note triplet, made by picking
     out two beats and putting both of them in threes. */
  it('puts every beat picked out into threes', () => {
    render(<TabEditor />)
    sheet().focus()
    press('s')
    press('ArrowRight')

    press('t')

    const doc = useTabs.getState().doc
    expect(doc.bars[0]?.beats[0]?.division).toBe(3)
    expect(doc.bars[0]?.beats[1]?.division).toBe(3)
    expect(doc.bars[0]?.beats[2]?.division).toBeUndefined()
  })

  it('writes it to the file', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('t')
    press('1')
    press('ArrowRight')
    press('2')

    await useTabs.getState().flush()

    const written = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(written).toContain('-1-2-')
  })
})

/*
 * Picking beats out is about beats, not strings, so up and down reach the
 * system above or below rather than stepping through the strings — and they
 * never put the selection down, since pressing an arrow while choosing is not
 * a way of asking to stop.
 */
describe('up and down while picking out beats', () => {
  /* Two systems: opening a section starts a new one. */
  const twoSystems = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<TabEditor />)
    sheet().focus()
    press('7')
    for (let step = 0; step < 8; step += 1) press('ArrowRight')
    press('t', { ctrlKey: true })
    await user.type(screen.getByLabelText('Section words'), 'Chorus:')
    fireEvent.keyDown(screen.getByLabelText('Section words'), { key: 'Escape' })
  }

  const picked = () => sheet().querySelectorAll('.tablature__picked').length

  it('holds on to the selection', async () => {
    const user = userEvent.setup()
    await twoSystems(user)
    press('s')
    expect(picked()).toBeGreaterThan(0)

    press('ArrowDown')

    expect(picked()).toBeGreaterThan(0)
  })

  it('reaches the system below, taking the selection with it', async () => {
    const user = userEvent.setup()
    await twoSystems(user)
    /* Back up into the first system, and pick from there. */
    for (let step = 0; step < 12; step += 1) press('ArrowLeft')
    press('s')
    const before = picked()

    press('ArrowDown')

    expect(picked()).toBeGreaterThan(before)
  })

  /* Nothing below is not a reason to put the selection down. */
  it('keeps it when there is no system that way', async () => {
    const user = userEvent.setup()
    await twoSystems(user)
    press('s')
    const before = picked()

    press('ArrowDown')
    press('ArrowDown')

    expect(picked()).toBe(before)
  })

  /*
   * The end of the selection is what is being steered, so it is what has to
   * stay on screen — the cursor has not moved and would keep the sheet where
   * it was, with the beats being chosen off the bottom of it.
   */
  it('brings what is being chosen into view', async () => {
    const user = userEvent.setup()
    await twoSystems(user)
    for (let step = 0; step < 12; step += 1) press('ArrowLeft')
    press('s')
    const scrolled = vi.fn()
    Element.prototype.scrollIntoView = scrolled

    press('ArrowDown')

    expect(scrolled).toHaveBeenCalled()
  })

  it('comes back up again', async () => {
    const user = userEvent.setup()
    await twoSystems(user)
    for (let step = 0; step < 12; step += 1) press('ArrowLeft')
    press('s')
    press('ArrowDown')
    const reached = picked()

    press('ArrowUp')

    expect(picked()).toBeLessThan(reached)
  })
})

/*
 * Shift and an arrow makes room beside the cursor. Where there is already a
 * sixteenth it halves that instead, which is a thirty-second — and nothing is
 * written over it, since what falls between two marks has no name.
 */
describe('thirty-seconds', () => {
  const marks = () =>
    [...sheet().querySelectorAll('.tablature__line')]
      .map((line) => line.textContent ?? '')
      .find((line) => /\d/.test(line) && !line.startsWith('|')) ?? ''

  it('makes room for a sixteenth the first time', () => {
    render(<TabEditor />)
    sheet().focus()

    press('ArrowRight', { shiftKey: true })

    expect(marks()).toContain('1 e')
  })

  it('halves it again the second time', () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowRight', { shiftKey: true })

    press('ArrowRight', { shiftKey: true })

    const doc = useTabs.getState().doc
    expect(doc.bars[0]?.beats[0]?.slots.map((slot) => slot.at)).toEqual([0, 2, 3, 4])
  })

  it('writes nothing over it', () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })

    /* Still the same three marks the beat always had. */
    expect(marks().replace(/[^ea&]/g, '')).toBe('ea&'.replace('a', ''))
  })

  it('stands the cursor on the new place, ready to type into', () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })

    press('7')

    const doc = useTabs.getState().doc
    expect(doc.bars[0]?.beats[0]?.slots[2]?.frets[0]).toBe('7')
  })

  it('writes it to the file', async () => {
    render(<TabEditor />)
    sheet().focus()
    press('ArrowRight', { shiftKey: true })
    press('ArrowRight', { shiftKey: true })
    press('7')

    await useTabs.getState().flush()

    const written = vi.mocked(window.rehearsal.library.writeTab).mock.calls.at(-1)?.[2] ?? ''
    expect(written.split('\n')[0]).toContain('1 e')
  })
})
