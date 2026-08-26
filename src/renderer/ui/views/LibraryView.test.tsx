// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { newSong, type SongSummary } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { useView } from '@renderer/state/view'
import { LibraryView } from './LibraryView'

const filterBar = () => screen.getByRole('group', { name: 'Filter by tag' })

const summary = (id: string, title: string, artist: string): SongSummary => ({
  id,
  title,
  artist,
  channelCount: 2,
  hasLyrics: false,
  tags: []
})

beforeEach(() => {
  installBridge()
  useView.setState({ view: 'library' })
  useSong.setState({
    song: null,
    error: null,
    songs: [summary('coast-road', 'Coast Road', 'The Lowlifes'), summary('b-side', 'B Side', '')]
  })
})

afterEach(() => {
  cleanup()
  useSong.setState({ songs: [], song: null })
  useView.setState({ view: 'library' })
})

describe('the delete dialog', () => {
  it('names the song whose row was clicked', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    const row = screen.getByText('B Side').closest('.song-row') as HTMLElement
    await user.click(row.querySelector('.song-row__delete') as HTMLElement)

    expect(screen.getByRole('dialog').textContent).toContain('Delete "B Side"?')
  })

  /* The same stale-copy trap as the channel editor: a dialog holding a row it
     was handed keeps showing it after the library has moved on. */
  it('follows the library rather than the row it was handed', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    const row = screen.getByText('Coast Road').closest('.song-row') as HTMLElement
    await user.click(row.querySelector('.song-row__delete') as HTMLElement)

    act(() => {
      useSong.setState({
        songs: [summary('coast-road', 'Coast Road (take 2)', 'The Lowlifes'), summary('b-side', 'B Side', '')]
      })
    })

    expect(screen.getByRole('dialog').textContent).toContain('Delete "Coast Road (take 2)"?')
  })

  it('deletes the song it named', async () => {
    const user = userEvent.setup()
    const library = installBridge()
    render(<LibraryView />)

    const row = screen.getByText('B Side').closest('.song-row') as HTMLElement
    await user.click(row.querySelector('.song-row__delete') as HTMLElement)
    await user.click(screen.getByRole('dialog').querySelector('.btn--primary') as HTMLElement)

    expect(library.remove).toHaveBeenCalledWith('b-side')
  })
})

/** A song is made in order to work on it, the same as opening one. */
describe('leaving the library', () => {
  it('goes to the player when a song is opened', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByText('Coast Road'))

    expect(useView.getState().view).toBe('player')
  })

  it('goes to the player when a song is made', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'New song' }))

    expect(window.rehearsal.library.create).toHaveBeenCalled()
    expect(useView.getState().view).toBe('player')
  })
})

const tagged = (id: string, title: string, tags: string[]): SongSummary => ({
  ...summary(id, title, ''),
  tags
})

const tagsOn = (title: string): string[] => {
  const row = screen.getByText(title).closest('.song-row') as HTMLElement
  return [...row.querySelectorAll('.tag__name')].map((tag) => tag.textContent ?? '')
}

const shownTitles = (): string[] =>
  [...document.querySelectorAll('.song-row__title')].map((title) => title.textContent ?? '')

/**
 * Tags are the user's own words for what a song is, and all of it happens in
 * the row: nothing here opens a dialog.
 */
describe('tags', () => {
  /* A library that remembers, since tagging saves the song and lists again. */
  let library: SongSummary[] = []

  beforeEach(() => {
    library = [
      tagged('coast-road', 'Coast Road', ['gig', 'open D']),
      tagged('b-side', 'B Side', ['gig']),
      tagged('new-one', 'New One', [])
    ]
    installBridge({
      list: async () => library,
      load: async (id: string) => ({
        ...newSong(id),
        id,
        tags: library.find((entry) => entry.id === id)?.tags ?? []
      }),
      save: async (song) => {
        library = library.map((entry) =>
          entry.id === song.id ? { ...entry, tags: song.tags } : entry
        )
        return song
      }
    })
    useSong.setState({ songs: library })
  })

  it('shows what each song is tagged with', () => {
    render(<LibraryView />)

    expect(tagsOn('Coast Road')).toEqual(['gig', 'open D'])
    expect(tagsOn('New One')).toEqual([])
  })

  it('adds a tag typed into the row', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Add a tag to New One' }))
    await user.type(screen.getByLabelText('New tag'), 'acoustic{Enter}')

    await waitFor(() => expect(tagsOn('New One')).toEqual(['acoustic']))
  })

  it('offers the tags other songs already use', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Add a tag to New One' }))

    expect(screen.getByRole('option', { name: 'gig' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'open D' })).toBeTruthy()
  })

  it('adds one that was picked rather than typed', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Add a tag to New One' }))
    await user.click(screen.getByRole('option', { name: 'open D' }))

    await waitFor(() => expect(tagsOn('New One')).toEqual(['open D']))
  })

  it('does not offer a tag the song already has', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Add a tag to B Side' }))

    expect(screen.queryByRole('option', { name: 'gig' })).toBeNull()
    expect(screen.getByRole('option', { name: 'open D' })).toBeTruthy()
  })

  it('removes a tag at once, with nothing to confirm', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Remove "gig" from Coast Road' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(tagsOn('Coast Road')).toEqual(['open D']))
  })

  it('shows only the songs with a chosen tag', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(within(filterBar()).getByRole('button', { name: 'open D' }))

    expect(shownTitles()).toEqual(['Coast Road'])
  })

  it('narrows further when a second tag is chosen', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(within(filterBar()).getByRole('button', { name: 'gig' }))
    expect(shownTitles()).toEqual(['B Side', 'Coast Road'])

    await user.click(within(filterBar()).getByRole('button', { name: 'open D' }))
    expect(shownTitles()).toEqual(['Coast Road'])
  })

  it('filters by a tag clicked on a song, since that is where they are read', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    const row = screen.getByText('Coast Road').closest('.song-row') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'open D' }))

    expect(shownTitles()).toEqual(['Coast Road'])
  })

  it('says so when nothing has all the chosen tags', async () => {
    const user = userEvent.setup()
    useSong.setState({
      songs: [tagged('a', 'A', ['gig']), tagged('b', 'B', ['open D'])]
    })
    render(<LibraryView />)

    await user.click(within(filterBar()).getByRole('button', { name: 'gig' }))
    await user.click(within(filterBar()).getByRole('button', { name: 'open D' }))

    expect(screen.getByText(/No song has all of those tags/)).toBeTruthy()
  })

  it('goes back to everything', async () => {
    const user = userEvent.setup()
    render(<LibraryView />)

    await user.click(within(filterBar()).getByRole('button', { name: 'gig' }))
    await user.click(screen.getByRole('button', { name: 'Show all' }))

    expect(shownTitles()).toHaveLength(3)
  })
})
