// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AudioChannel, ChannelOrigin, Song } from '@core/song/song'
import { newSong } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { SetupView } from './SetupView'

const audioChannel = (id: string, name: string, subject: AudioChannel['subject']) =>
  ({
    kind: 'audio',
    id,
    name,
    subject,
    file: `audio/${id}.ogg`,
    startTime: 0,
    duration: 45,
    gain: 0.8,
    muted: false,
    soloed: false,
    origin: { type: 'import', sourcePath: `/tmp/${name}.wav` } as ChannelOrigin
  }) as Song['channels'][number]

const loadedSong = (): Song => ({
  ...newSong('comeback-season'),
  title: 'Comeback Season',
  artist: 'The Lowlifes',
  channels: [audioChannel('c1', 'Bass take2', 'bass'), audioChannel('c2', 'Drums', 'drums')]
})

beforeEach(() => {
  installBridge()
  useSong.setState({ song: loadedSong(), songs: [], error: null, importing: false })
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null })
})

const value = (element: HTMLElement): string => (element as HTMLInputElement).value

const openEditor = async (user: ReturnType<typeof userEvent.setup>, channelName: string) => {
  const row = screen.getByText(channelName).closest('.channel-row')
  await user.click(within(row as HTMLElement).getByRole('button', { name: 'Edit' }))
  return screen.getByRole('dialog')
}

/**
 * These guard one specific failure: a component holding a copy of state it also
 * edits. A controlled input then resets to the stale copy after every
 * keystroke, so only the last character survives — which looks like the field
 * "appending one letter" rather than like a stale read.
 */
describe('typing into the channel editor', () => {
  it('keeps every character, not just the last one', async () => {
    const user = userEvent.setup()
    render(<SetupView />)

    const dialog = await openEditor(user, 'Bass take2')
    const input = within(dialog).getByLabelText('Name')

    await user.clear(input)
    await user.type(input, 'Low E string')

    expect(useSong.getState().song?.channels[0]?.name).toBe('Low E string')
    expect(value(input)).toBe('Low E string')
  })

  it('shows what was typed, rather than what was there when it opened', async () => {
    const user = userEvent.setup()
    render(<SetupView />)

    const dialog = await openEditor(user, 'Bass take2')
    await user.type(within(dialog).getByLabelText('Name'), '!')

    expect(value(within(dialog).getByLabelText('Name'))).toBe('Bass take2!')
    expect(screen.getByText('Bass take2!')).toBeTruthy()
  })

  it('edits the channel it was opened on, not the first one', async () => {
    const user = userEvent.setup()
    render(<SetupView />)

    const dialog = await openEditor(user, 'Drums')
    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Kit')

    expect(useSong.getState().song?.channels[1]?.name).toBe('Kit')
    expect(useSong.getState().song?.channels[0]?.name).toBe('Bass take2')
  })
})

describe('the instrument buttons', () => {
  it('offer instruments only, not other kinds of channel', async () => {
    const user = userEvent.setup()
    render(<SetupView />)

    const dialog = await openEditor(user, 'Bass take2')
    expect(within(dialog).queryByTitle('Metronome')).toBeNull()
    expect(within(dialog).queryByTitle('Lyrics')).toBeNull()
    expect(within(dialog).getByTitle('Music (full mix)')).toBeTruthy()
  })

  it('follow the selection rather than freezing at what was open', async () => {
    const user = userEvent.setup()
    render(<SetupView />)

    const dialog = await openEditor(user, 'Bass take2')
    const piano = within(dialog).getByTitle('Piano')
    expect(within(dialog).getByTitle('Bass guitar').dataset['engaged']).toBe('true')

    await user.click(piano)

    expect(useSong.getState().song?.channels[0]?.subject).toBe('piano')
    expect(within(dialog).getByTitle('Piano').dataset['engaged']).toBe('true')
    expect(within(dialog).getByTitle('Bass guitar').dataset['engaged']).toBe('false')
  })
})

describe('the song fields', () => {
  it.each([
    ['Title', 'Coast Road', (song: Song) => song.title],
    ['Artist', 'Somebody Else', (song: Song) => song.artist]
  ])('keeps every character typed into %s', async (label, typed, read) => {
    const user = userEvent.setup()
    render(<SetupView />)

    const input = screen.getByLabelText(label)
    await user.clear(input)
    await user.type(input, typed)

    expect(read(useSong.getState().song as Song)).toBe(typed)
    expect(value(input)).toBe(typed)
  })
})
