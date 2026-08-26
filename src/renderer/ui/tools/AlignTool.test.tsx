// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { useAlign } from '@renderer/state/align'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { AlignTool } from './AlignTool'

vi.mock('./usePeaks', () => ({ usePeaks: () => null }))

const click = (id: string, name: string, endTime: number) =>
  ({
    kind: 'metronome',
    id,
    name,
    subject: 'metronome',
    gain: 0.5,
    muted: false,
    soloed: false,
    sample: 'tick',
    bpm: 100,
    beatsPerMeasure: 4,
    startTime: endTime - 2.4,
    endTime,
    accentFirstBeat: true
  }) as Song['channels'][number]

/* The tool needs something to line a click up against, or it says so. */
const music = {
  kind: 'audio',
  id: 'music',
  name: 'Acoustic',
  subject: 'acoustic',
  file: 'audio/music.ogg',
  startTime: 0,
  duration: 120,
  gain: 0.8,
  muted: false,
  soloed: false,
  origin: { type: 'import', sourcePath: '/tmp/a.wav' }
} as Song['channels'][number]

const withClicks = (...clicks: Song['channels']): Song => ({
  ...newSong('a-song'),
  id: 'a-song',
  channels: [music, ...clicks]
})

beforeEach(() => {
  installBridge()
  useAlign.setState({ clickId: null })
  useSong.setState({ song: withClicks(click('click', 'Count-in', 0)) })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const chosenClick = () =>
  (screen.getByLabelText('Click track') as HTMLSelectElement).value

describe('which click track the tool shows', () => {
  it('shows the only one there is', () => {
    render(<AlignTool />)

    expect(chosenClick()).toBe('click')
  })

  /* Opening the tool for a click track that was just added is the whole
     reason it opens, so it cannot show the first one instead. */
  it('shows the one it was pointed at, not the first', () => {
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0), click('click-2', 'Bridge', 40))
    })
    useAlign.setState({ clickId: 'click-2' })
    render(<AlignTool />)

    expect(chosenClick()).toBe('click-2')
  })

  it('follows a later one being pointed at', async () => {
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0), click('click-2', 'Bridge', 40))
    })
    render(<AlignTool />)
    expect(chosenClick()).toBe('click')

    useAlign.setState({ clickId: 'click-2' })

    await waitFor(() => expect(chosenClick()).toBe('click-2'))
  })

  it('shows the one made from its own New button', async () => {
    const user = userEvent.setup()
    render(<AlignTool />)

    await user.click(screen.getByRole('button', { name: 'New' }))

    await waitFor(() => expect(useAlign.getState().clickId).toBe('click-2'))
  })

  it('says where a click track comes from when the song has none', () => {
    useSong.setState({ song: withClicks() })
    render(<AlignTool />)

    expect(screen.getByText(/Add a click track from the mixer/)).toBeTruthy()
  })
})
