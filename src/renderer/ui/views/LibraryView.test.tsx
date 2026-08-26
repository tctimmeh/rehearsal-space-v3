// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SongSummary } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { useView } from '@renderer/state/view'
import { LibraryView } from './LibraryView'

const summary = (id: string, title: string, artist: string): SongSummary => ({
  id,
  title,
  artist,
  channelCount: 2,
  hasLyrics: false
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
