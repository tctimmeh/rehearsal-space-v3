// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong } from '@core/song/song'
import { useLyrics } from '@renderer/state/lyrics'
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
