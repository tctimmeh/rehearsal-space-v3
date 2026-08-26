// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { AudioChannel, ChannelOrigin, Song } from '@core/song/song'
import { newSong } from '@core/song/song'
import { useAlign } from '@renderer/state/align'
import { useSong } from '@renderer/state/song'
import { useTools } from '@renderer/state/tools'
import { installBridge } from '@renderer/testing/bridge'
import { MixerDock } from './MixerDock'

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

const clickChannel = () =>
  ({
    kind: 'metronome',
    id: 'click',
    name: 'Count-in',
    subject: 'metronome',
    gain: 0.5,
    muted: false,
    soloed: false,
    sample: 'tick',
    bpm: 100,
    beatsPerMeasure: 4,
    startTime: -4,
    endTime: 0,
    accentFirstBeat: true
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
  useTools.setState((state) => ({ open: { ...state.open, align: false } }))
  useAlign.setState({ clickId: null })
  useSong.setState({ song: null })
})

const value = (element: HTMLElement): string => (element as HTMLInputElement).value

const dock = () => render(<MixerDock />)

/** Every strip carries its own menu of things to do with that channel. */
const openMenu = async (user: ReturnType<typeof userEvent.setup>, channelName: string) => {
  await user.click(screen.getByRole('button', { name: `${channelName} actions` }))
}

const openEditor = async (user: ReturnType<typeof userEvent.setup>, channelName: string) => {
  await openMenu(user, channelName)
  await user.click(screen.getByRole('menuitem', { name: /Edit/ }))
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
    dock()

    const dialog = await openEditor(user, 'Bass take2')
    const input = within(dialog).getByLabelText('Name')

    await user.clear(input)
    await user.type(input, 'Low E string')

    expect(useSong.getState().song?.channels[0]?.name).toBe('Low E string')
    expect(value(input)).toBe('Low E string')
  })

  it('shows what was typed, rather than what was there when it opened', async () => {
    const user = userEvent.setup()
    dock()

    const dialog = await openEditor(user, 'Bass take2')
    await user.type(within(dialog).getByLabelText('Name'), '!')

    expect(value(within(dialog).getByLabelText('Name'))).toBe('Bass take2!')
    expect(screen.getByText('Bass take2!')).toBeTruthy()
  })

  it('edits the channel it was opened on, not the first one', async () => {
    const user = userEvent.setup()
    dock()

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
    dock()

    const dialog = await openEditor(user, 'Bass take2')
    expect(within(dialog).queryByTitle('Metronome')).toBeNull()
    expect(within(dialog).queryByTitle('Lyrics')).toBeNull()
    expect(within(dialog).getByTitle('Music (full mix)')).toBeTruthy()
  })

  it('follow the selection rather than freezing at what was open', async () => {
    const user = userEvent.setup()
    dock()

    const dialog = await openEditor(user, 'Bass take2')
    const piano = within(dialog).getByTitle('Piano')
    expect(within(dialog).getByTitle('Bass guitar').dataset['engaged']).toBe('true')

    await user.click(piano)

    expect(useSong.getState().song?.channels[0]?.subject).toBe('piano')
    expect(within(dialog).getByTitle('Piano').dataset['engaged']).toBe('true')
    expect(within(dialog).getByTitle('Bass guitar').dataset['engaged']).toBe('false')
  })
})

/**
 * Everything that used to be a view of its own is reachable from the strip the
 * channel is on.
 */
describe('the channel menu', () => {
  it('offers the things you can do to a channel', async () => {
    const user = userEvent.setup()
    dock()

    await openMenu(user, 'Bass take2')

    expect(screen.getByRole('menuitem', { name: /Edit/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Split into stems/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Delete channel/ })).toBeTruthy()
  })

  it('will not offer to split a click track, which has nothing to split', async () => {
    const user = userEvent.setup()
    useSong.setState({
      song: { ...(useSong.getState().song as Song), channels: [clickChannel()] }
    })
    dock()

    await openMenu(user, 'Count-in')

    const split = screen.getByRole('menuitem', { name: /Split into stems/ })
    expect((split as HTMLButtonElement).disabled).toBe(true)
  })

  it('asks before deleting, and says what goes with it', async () => {
    const user = userEvent.setup()
    dock()

    await openMenu(user, 'Bass take2')
    await user.click(screen.getByRole('menuitem', { name: /Delete channel/ }))

    expect(screen.getByRole('dialog', { name: /Delete "Bass take2"/ })).toBeTruthy()
    expect(screen.getByText(/audio and waveform are removed/)).toBeTruthy()
  })

  it('closes when something else is chosen', async () => {
    const user = userEvent.setup()
    dock()

    await openMenu(user, 'Bass take2')
    await user.click(screen.getByRole('menuitem', { name: /Edit/ }))

    expect(screen.queryByRole('menuitem', { name: /Delete channel/ })).toBeNull()
  })
})

/**
 * A long channel name took its space out of the icon, which is drawn to fill
 * its box and so lost half of itself rather than getting smaller. There is no
 * layout in these tests to measure, so what is pinned is the marking that
 * keeps the icon out of the shrinking.
 */
describe('the channel icon', () => {
  it('is held at its own size, whatever the name does', () => {
    useSong.setState({
      song: {
        ...(useSong.getState().song as Song),
        channels: [
          {
            ...((useSong.getState().song as Song).channels[0] as Song['channels'][number]),
            name: 'Downloaded Audio'
          }
        ]
      }
    })
    dock()

    const icon = document.querySelector('.strip__name-icon')
    expect(icon).toBeTruthy()
    expect(icon?.querySelector('svg')).toBeTruthy()
  })
})

describe('adding a channel', () => {
  it('offers the three ways a channel gets here', async () => {
    const user = userEvent.setup()
    dock()

    await user.click(screen.getByRole('button', { name: 'Add a channel' }))

    expect(screen.getByRole('menuitem', { name: /Import audio/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Download from a URL/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: /Add a click track/ })).toBeTruthy()
  })

  it('adds a click track without asking anything further', async () => {
    const user = userEvent.setup()
    const before = (useSong.getState().song as Song).channels.length
    dock()

    await user.click(screen.getByRole('button', { name: 'Add a channel' }))
    await user.click(screen.getByRole('menuitem', { name: /Add a click track/ }))

    expect((useSong.getState().song as Song).channels).toHaveLength(before + 1)
  })

  /* A click track is added in order to line it up against the music. */
  it('opens the alignment tool on the click track it just added', async () => {
    const user = userEvent.setup()
    dock()

    await user.click(screen.getByRole('button', { name: 'Add a channel' }))
    await user.click(screen.getByRole('menuitem', { name: /Add a click track/ }))

    expect(useTools.getState().open.align).toBe(true)
    const added = (useSong.getState().song as Song).channels.at(-1)
    expect(useAlign.getState().clickId).toBe(added?.id)
  })

  it('points at the second click track when a second one is added', async () => {
    const user = userEvent.setup()
    dock()

    await user.click(screen.getByRole('button', { name: 'Add a channel' }))
    await user.click(screen.getByRole('menuitem', { name: /Add a click track/ }))
    const first = useAlign.getState().clickId

    await user.click(screen.getByRole('button', { name: 'Add a channel' }))
    await user.click(screen.getByRole('menuitem', { name: /Add a click track/ }))

    expect(useAlign.getState().clickId).not.toBe(first)
  })

  it('leaves the tool open rather than closing it on a second click track', async () => {
    const user = userEvent.setup()
    dock()

    for (const _ of [1, 2]) {
      await user.click(screen.getByRole('button', { name: 'Add a channel' }))
      await user.click(screen.getByRole('menuitem', { name: /Add a click track/ }))
    }

    expect(useTools.getState().open.align).toBe(true)
  })

  it('says how to start when the song has no channels at all', () => {
    useSong.setState({ song: { ...(useSong.getState().song as Song), channels: [] } })
    dock()

    expect(screen.getByText(/drop a file on the window/)).toBeTruthy()
  })
})
