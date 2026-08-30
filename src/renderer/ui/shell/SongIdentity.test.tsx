// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { HeaderBar } from './HeaderBar'

const loaded = (): Song => ({
  ...newSong('comeback-season'),
  id: 'comeback-season',
  title: 'Comeback Season',
  artist: 'The Lowlifes'
})

beforeEach(() => {
  installBridge()
  useSong.setState({ song: loaded(), songs: [], error: null, importing: false })
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null })
  vi.clearAllMocks()
})

const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Song name and artist' }))

const value = (element: HTMLElement) => (element as HTMLInputElement).value

/**
 * The name and the artist used to be fields in a view of their own. There is
 * only one place a song says what it is called, so that is where it is named.
 */
describe('the song name in the header', () => {
  it('shows what the song is called', () => {
    render(<HeaderBar />)

    expect(screen.getByText('Comeback Season')).toBeTruthy()
    expect(screen.getByText('The Lowlifes')).toBeTruthy()
  })

  it('says so plainly when there is no artist', () => {
    useSong.setState({ song: { ...loaded(), artist: '' } })
    render(<HeaderBar />)

    expect(screen.getByText('No artist')).toBeTruthy()
  })

  it('opens on the name, ready to type', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await open(user)

    expect(value(screen.getByLabelText('Name'))).toBe('Comeback Season')
    expect(document.activeElement).toBe(screen.getByLabelText('Name'))
  })

  it('keeps every character typed into the name', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    const field = screen.getByLabelText('Name')
    await user.clear(field)
    await user.type(field, 'Coast Road')

    expect(useSong.getState().song?.title).toBe('Coast Road')
    expect(value(field)).toBe('Coast Road')
  })

  it('keeps every character typed into the artist', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    const field = screen.getByLabelText('Artist')
    await user.clear(field)
    await user.type(field, 'Somebody Else')

    expect(useSong.getState().song?.artist).toBe('Somebody Else')
    expect(value(field)).toBe('Somebody Else')
  })

  it('shows the new name behind it as it is typed', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    await user.type(screen.getByLabelText('Name'), '!')

    expect(screen.getByText('Comeback Season!')).toBeTruthy()
  })

  /* Both fields save as they are typed, so Enter means "done" rather than
     "save" — and it means it from whichever field you are in. */
  it('closes on Enter from the name', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    await user.type(screen.getByLabelText('Name'), '{Enter}')

    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('closes on Enter from the artist', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    await user.type(screen.getByLabelText('Artist'), '{Enter}')

    expect(screen.queryByLabelText('Artist')).toBeNull()
  })

  it('keeps what was typed before Enter closed it', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    await user.type(screen.getByLabelText('Name'), '!{Enter}')

    expect(screen.getByText('Comeback Season!')).toBeTruthy()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await open(user)

    await user.keyboard('{Escape}')

    expect(screen.queryByLabelText('Name')).toBeNull()
  })

  it('offers nothing to rename when no song is loaded', () => {
    useSong.setState({ song: null })
    render(<HeaderBar />)

    expect(screen.getByText('No song loaded')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Song name and artist' })).toBeNull()
  })
})

/*
 * The name that is there is nearly always the wrong one — that is why the box
 * is open — so the useful thing is to be able to start typing over it.
 */
describe('opening the rename box', () => {
  it('picks out the whole name, ready to be typed over', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await open(user)

    const field = screen.getByLabelText('Name') as HTMLInputElement
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(0)
    expect(field.selectionEnd).toBe('Comeback Season'.length)
  })

  it('so that typing replaces it rather than adding to it', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await open(user)
    await user.keyboard('Sundown')

    expect(value(screen.getByLabelText('Name'))).toBe('Sundown')
  })

  /* The selection is made as the field arrives, not on every keystroke into
     it, or the second character typed would replace the first. */
  it('does not pick the name out again while it is being typed', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await open(user)
    await user.keyboard('ab')

    expect(value(screen.getByLabelText('Name'))).toBe('ab')
  })
})
