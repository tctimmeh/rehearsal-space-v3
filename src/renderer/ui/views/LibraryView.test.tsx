// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type SongSummary } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { useView } from '@renderer/state/view'
import { LibraryView } from './LibraryView'

const filterBar = () => screen.getByRole('group', { name: 'Filter' })

const summary = (
  id: string,
  title: string,
  artist: string,
  has: Partial<SongSummary> = {}
): SongSummary => ({
  id,
  title,
  artist,
  channelCount: 2,
  hasAudio: false,
  hasLyrics: false,
  hasTabs: false,
  tags: [],
  ...has
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
  /* The name opens the song and nothing else does: filling the column made
     the empty space beside a short title open it, which is a click nobody
     aimed at anything. */
  it('opens a song from its name and not from the space beside it', () => {
    render(<LibraryView />)

    const opens = screen.getByRole('button', { name: 'Coast Road' })

    expect(opens.textContent).toBe('Coast Road')
    expect(opens.querySelector('.song-row__artist')).toBeNull()
    expect(opens.className).toContain('song-row__open')
  })

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

describe('where the filter sits', () => {
  it('comes before the button that makes a song', () => {
    useSong.setState({ songs: [tagged('coast-road', 'Coast Road', ['gig'])] })
    render(<LibraryView />)
    const bar = filterBar().parentElement as HTMLElement

    const order = [...bar.children].map((child) =>
      child.classList.contains('library__filter') ? 'filter' : 'button'
    )
    expect(order).toEqual(['filter', 'button'])
  })
})

/* A library of names says nothing about which of them have anything in them. */
describe('what each song holds', () => {
  const held = (name: string) => screen.getAllByRole('img', { name })

  it('says so when a song has audio, lyrics and tablature', () => {
    useSong.setState({
      songs: [summary('all', 'All', '', { hasAudio: true, hasLyrics: true, hasTabs: true })]
    })
    render(<LibraryView />)

    expect(held('Has audio')).toHaveLength(1)
    expect(held('Has lyrics')).toHaveLength(1)
    expect(held('Has tablature')).toHaveLength(1)
  })

  /* What is absent is drawn too, so a row reads as three answers rather than
     as however many marks happened to fit. */
  it('says so when it has none of them', () => {
    useSong.setState({ songs: [summary('bare', 'Bare', '')] })
    render(<LibraryView />)

    expect(held('No audio')).toHaveLength(1)
    expect(held('No lyrics')).toHaveLength(1)
    expect(held('No tablature')).toHaveLength(1)
  })

  it('answers each one on its own', () => {
    useSong.setState({ songs: [summary('words', 'Words', '', { hasLyrics: true })] })
    render(<LibraryView />)

    expect(held('No audio')).toHaveLength(1)
    expect(held('Has lyrics')).toHaveLength(1)
    expect(held('No tablature')).toHaveLength(1)
  })
})

describe('filtering by artist', () => {
  const threeSongs = () =>
    useSong.setState({
      songs: [
        summary('coast-road', 'Coast Road', 'The Lowlifes', { tags: ['gig'] }),
        summary('near-miss', 'Near Miss', 'the lowlifes'),
        summary('undertow', 'Undertow', 'Marla Vance', { tags: ['gig', 'live'] }),
        summary('b-side', 'B Side', '')
      ]
    })

  const titles = () =>
    [...document.querySelectorAll('.song-row__title')].map((one) => one.textContent)

  it('shows only that artist when their name is clicked in a row', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'The Lowlifes' }))

    expect(titles()).toEqual(['Coast Road', 'Near Miss'])
  })

  /* The same band typed into two songs on two days is the same band. */
  it('gathers the spellings that differ only in shouting', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'the lowlifes' }))

    expect(titles()).toEqual(['Coast Road', 'Near Miss'])
  })

  it('goes back to everything when the same artist is clicked again', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Marla Vance' }))
    expect(titles()).toEqual(['Undertow'])

    await user.click(within(filterBar()).getByRole('button', { name: 'Marla Vance' }))

    expect(titles()).toHaveLength(4)
  })

  it('narrows by an artist and a tag together', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(within(filterBar()).getByRole('button', { name: 'gig' }))
    await user.click(screen.getByRole('button', { name: 'Marla Vance' }))

    expect(titles()).toEqual(['Undertow'])
    expect(screen.getByRole('button', { name: 'Show all' })).toBeDefined()
  })

  it('says which artist found nothing, and lets go of both at once', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'The Lowlifes' }))
    /* A tag only the other artist has, so the two together find nothing. */
    await user.click(within(filterBar()).getByRole('button', { name: 'live' }))

    expect(titles()).toEqual([])
    expect(screen.getByText('No song by The Lowlifes has all of those tags.')).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(titles()).toHaveLength(4)
  })

  /* There is nothing to narrow to, and a row of them all saying the same
     would be four buttons that do nothing. */
  it('leaves a song with no artist as words rather than a button', () => {
    threeSongs()
    render(<LibraryView />)

    expect(screen.queryByRole('button', { name: 'No artist' })).toBeNull()
    expect(screen.getByText('No artist').tagName).toBe('SPAN')
  })

  it('shows the artist being asked for where the tags are', async () => {
    const user = userEvent.setup()
    threeSongs()
    render(<LibraryView />)

    await user.click(screen.getByRole('button', { name: 'Marla Vance' }))

    const held = within(filterBar()).getByRole('button', { name: 'Marla Vance' })
    expect(held.getAttribute('aria-pressed')).toBe('true')
  })

  /* A library with no tags in it at all still has to show what it is filtered
     to, or there is no way back. */
  it('shows the bar for an artist even where no song has a tag', async () => {
    const user = userEvent.setup()
    useSong.setState({
      songs: [summary('a', 'A', 'Marla Vance'), summary('b', 'B', 'The Lowlifes')]
    })
    render(<LibraryView />)
    expect(screen.queryByRole('group', { name: 'Filter' })).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Marla Vance' }))

    expect(within(filterBar()).getByRole('button', { name: 'Show all' })).toBeDefined()
  })
})

/**
 * A library of any size opens at the top, which is nowhere near whatever is
 * being worked on.
 */
describe('arriving with a song loaded', () => {
  const ROW = 60
  const LIST = 300

  /* jsdom has no layout, so the list is given one: forty rows of 60px in a
     window 300px tall, and a scrollTop that behaves like a real one. */
  const laidOut = (loaded: string) => {
    /* Numbered so that sorting them by title puts them in the order they are
       written here, which is what the row positions below assume. */
    const songs = Array.from({ length: 40 }, (_, index) => {
      const at = String(index).padStart(2, '0')
      return summary(`song-${at}`, `Song ${at}`, 'Someone')
    })
    useSong.setState({ songs, song: { ...newSong(loaded), id: loaded } })

    let top = 0
    Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
      configurable: true,
      get: () => top,
      set(next: number) {
        top = Math.min(Math.max(next, 0), songs.length * ROW - LIST)
      }
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.className.includes('library__rows')) {
        return { top: 0, height: LIST, bottom: LIST } as DOMRect
      }
      const index = [...(this.parentElement?.children ?? [])].indexOf(this)
      return { top: index * ROW - top, height: ROW, bottom: index * ROW - top + ROW } as DOMRect
    })
    return () => top
  }

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTop')
  })

  it('puts the loaded song in the middle of the list', () => {
    const scrollTop = laidOut('song-20')
    render(<LibraryView />)

    /* Row 20 spans 1200-1260; centred in a 300px window means 1080. */
    expect(scrollTop()).toBe(20 * ROW - (LIST - ROW) / 2)
  })

  /* Nothing above it to scroll into view, so it simply sits where it is. */
  it('leaves a song near the top at the top', () => {
    const scrollTop = laidOut('song-00')
    render(<LibraryView />)

    expect(scrollTop()).toBe(0)
  })

  it('leaves a song near the bottom at the bottom', () => {
    const scrollTop = laidOut('song-39')
    render(<LibraryView />)

    expect(scrollTop()).toBe(40 * ROW - LIST)
  })

  it('does nothing at all when no song is loaded', () => {
    const scrollTop = laidOut('song-20')
    useSong.setState({ song: null })
    render(<LibraryView />)

    expect(scrollTop()).toBe(0)
  })

  /* The loaded song can be filtered out of the list, and then there is no row
     to put anywhere. */
  it('does nothing when the loaded song is not in the list', () => {
    const scrollTop = laidOut('somewhere-else')
    render(<LibraryView />)

    expect(scrollTop()).toBe(0)
  })
})
