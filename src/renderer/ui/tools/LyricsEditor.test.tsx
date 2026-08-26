// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong } from '@core/song/song'
import { insertIntoLyrics, useLyrics } from '@renderer/state/lyrics'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { LyricsEditor } from './LyricsEditor'

const chart = ['[Verse 1]', 'C       Am', 'Counted every mile', '', 'F       G'].join('\n')

beforeEach(() => {
  installBridge()
  const library = window.rehearsal.library as unknown as Record<string, unknown>
  library['readLyrics'] = vi.fn(async () => '')
  library['writeLyrics'] = vi.fn(async () => undefined)
  useSong.setState({ song: { ...newSong('a-song'), id: 'a-song' } })
  useLyrics.setState({ songId: 'a-song', text: chart, saved: true, error: null })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const field = () => screen.getByRole('textbox', { name: 'Lyrics' }) as HTMLTextAreaElement
const coloured = () => [...document.querySelectorAll('.editor__line')] as HTMLElement[]
const numbers = () =>
  [...document.querySelectorAll('.editor__gutter div')].map((line) => line.textContent)

describe('the editor', () => {
  it('shows the words as they are, to be edited as text', () => {
    render(<LyricsEditor />)

    expect(field().value).toBe(chart)
  })

  it('numbers every line, including the empty ones', () => {
    render(<LyricsEditor />)

    expect(numbers()).toEqual(['1', '2', '3', '4', '5'])
  })

  it('colours section markers and chord lines, and leaves the words plain', () => {
    render(<LyricsEditor />)

    expect(coloured().map((line) => line.className.replace('editor__line editor__line--', '')))
      .toEqual(['section', 'chords', 'lyric', 'blank', 'chords'])
  })

  it('keeps what is typed', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)

    await user.clear(field())
    await user.type(field(), 'a new line')

    expect(useLyrics.getState().text).toBe('a new line')
  })

  it('says whether the words are safe on disk', () => {
    render(<LyricsEditor />)
    expect(screen.getByText('Saved · 5 lines')).toBeDefined()

    useLyrics.setState({ saved: false })
    cleanup()
    render(<LyricsEditor />)
    expect(screen.getByText('Saving…')).toBeDefined()
  })

  it('says when the words could not be saved, rather than looking saved', () => {
    useLyrics.setState({ error: 'Could not save the lyrics: read-only file system' })
    render(<LyricsEditor />)

    expect(screen.getByText(/read-only file system/)).toBeDefined()
  })
})

describe('transposing from the editor', () => {
  it('moves every chord up and leaves the words alone', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)

    await user.click(screen.getByRole('button', { name: '+' }))

    expect(useLyrics.getState().text.split('\n')).toEqual([
      '[Verse 1]',
      'C#      A#m',
      'Counted every mile',
      '',
      'F#      G#'
    ])
  })

  it('moves every chord down', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)

    await user.click(screen.getByRole('button', { name: '−' }))

    expect(useLyrics.getState().text.split('\n')[1]).toBe('B       Abm')
  })
})

/** Chord charts are written in columns, and a tab is how a column is reached. */
describe('the tab key', () => {
  it('moves to the next column instead of leaving the editor', async () => {
    const user = userEvent.setup()
    useLyrics.setState({ text: '' })
    render(<LyricsEditor />)

    await user.click(field())
    await user.type(field(), 'C')
    await user.tab()

    expect(useLyrics.getState().text).toBe('C   ')
    expect(document.activeElement).toBe(field())
  })

  it('lands on the column, whatever it started from', async () => {
    const user = userEvent.setup()
    useLyrics.setState({ text: '' })
    render(<LyricsEditor />)

    await user.click(field())
    await user.type(field(), 'Am')
    await user.tab()

    /* Two characters in, so two spaces reach the four-column stop. */
    expect(useLyrics.getState().text).toBe('Am  ')
  })
})

/**
 * Taken from a real song in the library: remarks in brackets, lines marked as
 * not finished, and chords with brackets of their own.
 */
describe('the kinds of line in a real song', () => {
  const song = [
    '[Bridge]',
    'C  Fmaj7/C  C  (x2)',
    '- Storm winds blowing and we only know to run  ("only know to run" is awkward)',
    'A long long time ago',
    '(Repeat intro x2, End on beat 3)',
    'Am(add4)/F#           G       G7'
  ].join('\n')

  beforeEach(() => {
    useLyrics.setState({ text: song })
  })

  it('tells each kind apart', () => {
    render(<LyricsEditor />)

    expect(coloured().map((line) => line.className.replace('editor__line editor__line--', '')))
      .toEqual(['section', 'chords', 'unfinished', 'lyric', 'lyric', 'chords'])
  })

  it('marks the remark on a line rather than the whole line', () => {
    render(<LyricsEditor />)
    const unfinished = coloured()[2] as HTMLElement

    const remark = unfinished.querySelector('.editor__comment')
    expect(remark?.textContent).toBe('("only know to run" is awkward)')
    expect(unfinished.textContent).toBe(
      '- Storm winds blowing and we only know to run  ("only know to run" is awkward)'
    )
  })

  it('marks a repeat mark on a chord line as a remark', () => {
    render(<LyricsEditor />)

    expect((coloured()[1] as HTMLElement).querySelector('.editor__comment')?.textContent).toBe(
      '(x2)'
    )
  })

  it('transposes the chords and leaves every remark alone', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)

    await user.click(screen.getByRole('button', { name: '+' }))

    const after = useLyrics.getState().text.split('\n')
    expect(after[1]).toBe('C# F#maj7/C# C# (x2)')
    expect(after[5]).toBe('A#m(add4)/G           G#      G#7')
    expect(after[2]).toBe(
      '- Storm winds blowing and we only know to run  ("only know to run" is awkward)'
    )
  })
})

/**
 * Setting the value of a text area replaces the whole thing, and a text area
 * whose value is replaced loses where it was scrolled to and every undo it
 * had. Edits go through the editing command so that neither happens.
 */
describe('how edits reach the field', () => {
  let typed: { text: string }[] = []

  beforeEach(() => {
    typed = []
    /* jsdom has no editing command, so stand one in that does what the real
       one does: change the field and let it be heard as an ordinary edit. */
    document.execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => {
      if (command !== 'insertText') return false
      const field = document.querySelector('.editor__input') as HTMLTextAreaElement
      const before = field.value.slice(0, field.selectionStart)
      const after = field.value.slice(field.selectionEnd)
      typed.push({ text: value ?? '' })
      fireEvent.change(field, { target: { value: `${before}${value ?? ''}${after}` } })
      return true
    }) as typeof document.execCommand
  })

  it('types a rhyme in rather than replacing the words around it', () => {
    render(<LyricsEditor />)
    const field = screen.getByRole('textbox', { name: 'Lyrics' }) as HTMLTextAreaElement
    field.setSelectionRange(9, 9)

    act(() => {
      insertIntoLyrics('bemoan')
    })

    expect(typed).toEqual([{ text: 'bemoan' }])
    expect(useLyrics.getState().text.startsWith('[Verse 1]bemoan')).toBe(true)
  })

  it('types the spaces a tab stands for', async () => {
    const user = userEvent.setup()
    useLyrics.setState({ text: 'C' })
    render(<LyricsEditor />)
    const field = screen.getByRole('textbox', { name: 'Lyrics' }) as HTMLTextAreaElement
    field.setSelectionRange(1, 1)

    await user.tab()
    fireEvent.keyDown(field, { key: 'Tab' })

    expect(typed).toEqual([{ text: '   ' }])
  })

  it('types a transposition in, so it can be undone like anything else', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)

    await user.click(screen.getByRole('button', { name: '+' }))

    expect(typed).toHaveLength(1)
    expect(typed[0]?.text.split('\n')[1]).toBe('C#      A#m')
  })

  it('keeps the view where it was while transposing', async () => {
    const user = userEvent.setup()
    render(<LyricsEditor />)
    const field = screen.getByRole('textbox', { name: 'Lyrics' }) as HTMLTextAreaElement
    field.scrollTop = 120

    await user.click(screen.getByRole('button', { name: '+' }))

    expect(field.scrollTop).toBe(120)
  })
})
