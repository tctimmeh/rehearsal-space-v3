// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { useAlign } from '@renderer/state/align'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { installBridge } from '@renderer/testing/bridge'
import { AlignTool } from './AlignTool'
import { installPointerCapture } from '@renderer/testing/pointer'

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

  /* Click tracks are added from the mixer; the tool only lines them up. */
  it('offers no way to make one, since the mixer is where they come from', () => {
    render(<AlignTool />)

    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  it('says where a click track comes from when the song has none', () => {
    useSong.setState({ song: withClicks() })
    render(<AlignTool />)

    expect(screen.getByText(/Add a click track from the mixer/)).toBeTruthy()
  })
})

/**
 * Finding a spot means hunting for it by ear, which is a drag rather than a
 * series of guesses.
 */
describe('moving the playhead', () => {
  const strip = () => document.querySelector('.align__strip') as HTMLElement

  const dragAcross = (from: number, to: number) => {
    const element = strip()
    fireEvent.pointerDown(element, { button: 0, clientX: from, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: (from + to) / 2, pointerId: 1 })
    fireEvent.pointerMove(element, { clientX: to, pointerId: 1 })
    fireEvent.pointerUp(element, { pointerId: 1 })
  }

  beforeEach(() => {
    /* jsdom has neither pointer capture nor layout. */
    installPointerCapture()
    /* The strip has no width in jsdom, so it is given one. */
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      right: 1000,
      width: 1000,
      top: 0,
      bottom: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({})
    } as DOMRect)
  })

  it('follows the pointer while the button is down', () => {
    const seeks: number[] = []
    /* Before rendering: the tool reads the seek it is given at render time. */
    useTransport.setState({ seek: (position: number) => seeks.push(position) })
    render(<AlignTool />)

    dragAcross(100, 700)

    expect(seeks).toHaveLength(3)
    expect(seeks[2]).toBeGreaterThan(seeks[0] as number)
  })

  it('stops following once the button is up', () => {
    const seeks: number[] = []
    useTransport.setState({ seek: (position: number) => seeks.push(position) })
    render(<AlignTool />)
    dragAcross(100, 700)
    seeks.length = 0

    fireEvent.pointerMove(strip(), { clientX: 900, pointerId: 1 })

    expect(seeks).toEqual([])
  })

  it('leaves the handles to do their own dragging', () => {
    const seeks: number[] = []
    useTransport.setState({ seek: (position: number) => seeks.push(position) })
    render(<AlignTool />)
    const handle = document.querySelector('.align__handle') as HTMLElement

    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 1 })

    expect(seeks).toEqual([])
  })
})
