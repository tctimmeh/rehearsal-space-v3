// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { songBounds } from '@core/song/bounds'
import { newSong, type Song } from '@core/song/song'
import { useAlign } from '@renderer/state/align'
import { useWaveformView } from '@renderer/state/waveformView'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { installBridge } from '@renderer/testing/bridge'
import { WaveformTool } from './WaveformTool'
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
    sample: 'woodblock',
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
  /* The tool remembers where each song was left, which would otherwise carry
     from one test to the next. */
  useWaveformView.setState({ windows: {} })
  useSong.setState({ song: withClicks(click('click', 'Count-in', 0)) })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const chosenClick = () =>
  (screen.getByLabelText('Click track') as HTMLSelectElement).value

/* The tool opens on the loop region, which is what it is most often wanted
   for; lining up a click track is the other tab. */
const pickClickJob = () => fireEvent.click(screen.getByRole('tab', { name: 'Click align' }))

describe('which click track the tool shows', () => {
  it('shows the only one there is', () => {
    render(<WaveformTool />)
    pickClickJob()

    expect(chosenClick()).toBe('click')
  })

  /* Opening the tool for a click track that was just added is the whole
     reason it opens, so it cannot show the first one instead. */
  it('shows the one it was pointed at, not the first', () => {
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0), click('click-2', 'Bridge', 40))
    })
    useAlign.setState({ clickId: 'click-2' })
    render(<WaveformTool />)

    expect(chosenClick()).toBe('click-2')
  })

  it('follows a later one being pointed at', async () => {
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0), click('click-2', 'Bridge', 40))
    })
    render(<WaveformTool />)
    pickClickJob()
    expect(chosenClick()).toBe('click')

    useAlign.setState({ clickId: 'click-2' })

    await waitFor(() => expect(chosenClick()).toBe('click-2'))
  })

  /* Click tracks are added from the mixer; the tool only lines them up. */
  it('offers no way to make one, since the mixer is where they come from', () => {
    render(<WaveformTool />)

    expect(screen.queryByRole('button', { name: 'New' })).toBeNull()
  })

  it('says where a click track comes from when the song has none', () => {
    useSong.setState({ song: withClicks() })
    render(<WaveformTool />)
    pickClickJob()

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
    render(<WaveformTool />)

    dragAcross(100, 700)

    expect(seeks).toHaveLength(3)
    expect(seeks[2]).toBeGreaterThan(seeks[0] as number)
  })

  it('stops following once the button is up', () => {
    const seeks: number[] = []
    useTransport.setState({ seek: (position: number) => seeks.push(position) })
    render(<WaveformTool />)
    dragAcross(100, 700)
    seeks.length = 0

    fireEvent.pointerMove(strip(), { clientX: 900, pointerId: 1 })

    expect(seeks).toEqual([])
  })

  it('leaves the handles to do their own dragging', () => {
    const seeks: number[] = []
    useTransport.setState({ seek: (position: number) => seeks.push(position) })
    render(<WaveformTool />)
    pickClickJob()
    const handle = document.querySelector('.align__handle') as HTMLElement

    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 1 })

    expect(seeks).toEqual([])
  })
})

/**
 * The waveform area does whatever needs looking at the music. Marking out the
 * stretch to go round is the same kind of job as lining up a click track, and
 * is done in the same place.
 */
describe('the loop region', () => {
  const pickLoopJob = async () => {
    fireEvent.click(screen.getByRole('tab', { name: 'Loop region' }))
    await waitFor(() => screen.getByRole('tab', { name: 'Loop region', selected: true }))
  }

  /* The strip is mocked at 1000px wide and opens 4 seconds across, from -2. */
  const strip = () => document.querySelector('.align__strip') as HTMLElement
  const drawAcross = (fromX: number, toX: number, shiftKey = true) => {
    fireEvent.pointerDown(strip(), { clientX: fromX, button: 0, pointerId: 1, shiftKey })
    fireEvent.pointerMove(strip(), { clientX: toX, pointerId: 1, shiftKey })
    fireEvent.pointerUp(strip(), { clientX: toX, pointerId: 1, shiftKey })
  }

  const saved = () => useSong.getState().song?.loop ?? null

  beforeEach(() => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), loop: null },
      update: (patch) =>
        useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    })
    useTransport.setState({ start: 0, end: 120, position: 0 })
    /* A window four seconds wide from -2, so the pixels below mean something.
       Left to itself the tool would open on the whole song. */
    useWaveformView.setState({ windows: { 'a-song': { span: 4, centre: 0 } } })
  })

  it('is not there until it is set', async () => {
    render(<WaveformTool />)
    await pickLoopJob()

    expect(screen.queryByRole('slider', { name: /Loop from/ })).toBeNull()
  })

  /* There is nothing to take hold of until there is a region, so the first one
     is drawn out rather than dragged. */
  it('is drawn by shift-dragging across the waveform', async () => {
    render(<WaveformTool />)
    await pickLoopJob()

    /* Half the width of a window four seconds across. */
    drawAcross(250, 750)

    const loop = saved() as { start: number; end: number }
    expect(loop.end - loop.start).toBeCloseTo(2, 5)
  })

  it('is drawn the same either way round', async () => {
    render(<WaveformTool />)
    await pickLoopJob()
    drawAcross(250, 750)
    const forwards = saved()

    useSong.setState((state) => ({ song: { ...(state.song as Song), loop: null } }))
    drawAcross(750, 250)

    expect(saved()).toEqual(forwards)
  })

  it('is not drawn by a plain drag, which scrubs', async () => {
    render(<WaveformTool />)
    await pickLoopJob()

    drawAcross(250, 750, false)

    expect(saved()).toBeNull()
  })

  /* The last move of a drag can arrive too late to have been rendered, and
     the region would come up short of where the button actually came up. */
  it('reaches where the button came up, not where the last move was drawn', async () => {
    render(<WaveformTool />)
    await pickLoopJob()

    fireEvent.pointerDown(strip(), { clientX: 250, button: 0, pointerId: 1, shiftKey: true })
    fireEvent.pointerMove(strip(), { clientX: 500, pointerId: 1, shiftKey: true })
    fireEvent.pointerUp(strip(), { clientX: 750, pointerId: 1, shiftKey: true })

    const loop = saved() as { start: number; end: number }
    expect(loop.end - loop.start).toBeCloseTo(2, 5)
  })

  /* A region that short is a click that slipped, not a decision. */
  it('is not drawn by a shift-click that barely moved', async () => {
    render(<WaveformTool />)
    await pickLoopJob()

    drawAcross(500, 505)

    expect(saved()).toBeNull()
  })

  /* The window opens four seconds wide around the click, so a region has to be
     within that to have handles rather than an arrow saying which way it lies. */
  it('is kept on the song, so it is there tomorrow', async () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), loop: { start: 0, end: 2 } }
    })
    render(<WaveformTool />)
    await pickLoopJob()

    expect(screen.getByRole('slider', { name: 'Loop from 00:00' })).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'Loop to 00:02' })).toBeTruthy()
  })

  it('says which way it lies when it is off the side of the window', async () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), loop: { start: 40, end: 50 } }
    })
    render(<WaveformTool />)
    await pickLoopJob()

    expect(screen.queryByRole('slider', { name: /Loop from/ })).toBeNull()
    expect(screen.getByText(/loop from/)).toBeTruthy()
  })

  it('is cleared, and stays cleared', async () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), loop: { start: 0, end: 2 } }
    })
    render(<WaveformTool />)
    await pickLoopJob()

    fireEvent.click(screen.getByRole('button', { name: 'Clear region' }))

    expect(saved()).toBeNull()
  })

  /* Dragging one end past the other would leave a region running backwards,
     which nothing downstream would know what to do with. */
  it('cannot be turned inside out by dragging', async () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), loop: { start: 0, end: 2 } }
    })
    render(<WaveformTool />)
    await pickLoopJob()

    /* The strip is 1000px wide and 4 seconds across, so the far right is well
       past where the region ends. */
    const from = screen.getByRole('slider', { name: /Loop from/ })
    fireEvent.pointerDown(from, { clientX: 990, pointerId: 1 })

    const loop = saved() as { start: number; end: number }
    expect(loop.start).toBeLessThan(loop.end)
  })
})

/**
 * Closing a tool and opening it again should not cost you the place you had
 * found — the zoom especially, which takes a few seconds of scrolling to get
 * back to.
 */
describe('where the tool was left', () => {
  beforeEach(() => {
    useSong.setState({ song: withClicks(click('click', 'Count-in', 0)) })
    useTransport.setState({ start: 0, end: 120, position: 0 })
  })

  it('opens a song it has not seen on the whole of it', () => {
    render(<WaveformTool />)

    /* The window is the song and a little air, whatever the clock says. */
    expect(screen.getByText(/^-?00:0[01]$/)).toBeTruthy()
  })

  /* The tab and the channel are kept on the song, so they come back with it
     rather than only lasting as long as the app does. */
  it('keeps the tab on the song', () => {
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0)),
      update: (patch) =>
        useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    })
    render(<WaveformTool />)

    pickClickJob()

    expect(useSong.getState().song?.waveform.tab).toBe('click')
  })

  it('keeps the channel on the song', () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)) },
      update: (patch) =>
        useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
    })
    render(<WaveformTool />)

    fireEvent.change(screen.getByLabelText('Channel'), { target: { value: 'music' } })

    expect(useSong.getState().song?.waveform.channel).toBe('music')
  })

  it('opens on the tab the song was left on', () => {
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), waveform: { tab: 'click', channel: null } }
    })

    render(<WaveformTool />)

    expect(screen.getByRole('tab', { name: 'Click align', selected: true })).toBeTruthy()
  })

  it('comes back to the zoom it was left at', () => {
    useWaveformView.setState({ windows: { 'a-song': { span: 4, centre: 30 } } })

    render(<WaveformTool />)

    /* Four seconds from 28, rather than the whole two minutes. */
    expect(screen.getByText('00:28')).toBeTruthy()
  })

  it('keeps each song\'s place separately', () => {
    useWaveformView.setState({ windows: { 'a-song': { span: 4, centre: 30 } } })
    useSong.setState({
      song: { ...withClicks(click('click', 'Count-in', 0)), id: 'another-song' }
    })

    render(<WaveformTool />)

    expect(screen.queryByText('00:28')).toBeNull()
  })
})

/*
 * The second trace is there to line a take up against something. Under any
 * other job it is a trace nobody asked for, and it halves the height of the
 * one they are actually working on.
 */
describe('the channel a take is lined up against', () => {
  const twoTakes = (tab: Song['waveform']['tab']): Song => ({
    ...newSong('a-song'),
    id: 'a-song',
    channels: [music, { ...(music as Song['channels'][number]), id: 'band', name: 'Band' }],
    waveform: { tab, channel: 'music', against: 'band' }
  })

  const traces = (container: HTMLElement) => container.querySelectorAll('.align__traces canvas')

  it('is drawn under the take while trimming', () => {
    useSong.setState({ song: twoTakes('trim') })
    const { container } = render(<WaveformTool />)

    expect(traces(container)).toHaveLength(2)
  })

  it('is not drawn while marking out a loop', () => {
    useSong.setState({ song: twoTakes('loop') })
    const { container } = render(<WaveformTool />)

    expect(traces(container)).toHaveLength(1)
  })

  it('is not drawn while lining up a click track', () => {
    useSong.setState({ song: twoTakes('click') })
    const { container } = render(<WaveformTool />)

    expect(traces(container)).toHaveLength(1)
  })

  /* Not forgotten, only put away: coming back to trimming brings it back. */
  it('is remembered for when trimming comes round again', () => {
    useSong.setState({ song: twoTakes('loop') })
    const { container, rerender } = render(<WaveformTool />)
    expect(traces(container)).toHaveLength(1)

    useSong.setState({ song: twoTakes('trim') })
    rerender(<WaveformTool />)

    expect(traces(container)).toHaveLength(2)
  })
})

/**
 * A count-in begins before 00:00, so lining one up is done from behind the
 * beginning of the song — and the click's own start *is* the song's start
 * while it is there, which is what made this hard: the view was clamped to
 * bounds the drag itself was moving.
 */
describe('lining up a click that starts before the song', () => {
  const SPAN = 4
  const centreNow = () => useWaveformView.getState().windows['a-song']?.centre
  const startHandle = () => screen.getByRole('slider', { name: /^Start/ })
  /* 1000px across 4 seconds, from the left edge of the window. */
  const xOf = (time: number) => ((time - ((centreNow() as number) - SPAN / 2)) / SPAN) * 1000

  const dragStartTo = (x: number) => {
    const handle = startHandle()
    fireEvent.pointerDown(handle, { button: 0, clientX: xOf(-2.4), pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: x, pointerId: 1 })
  }

  beforeEach(() => {
    installPointerCapture()
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

    /* The song's bounds follow its channels, as they do in the app: without
       that link none of this can happen at all. */
    useSong.setState({
      song: withClicks(click('click', 'Count-in', 0)),
      update: async (patch) => {
        useSong.setState((state) => ({ song: { ...(state.song as Song), ...patch } }))
        const [start, end] = songBounds(useSong.getState().song as Song)
        useTransport.setState({ start, end })
      }
    })
    const [start, end] = songBounds(useSong.getState().song as Song)
    useTransport.setState({ start, end, position: 0 })
    /* Parked at the far left, looking at the count-in. */
    useWaveformView.setState({ windows: { 'a-song': { span: SPAN, centre: -1.4 } } })
  })

  it('can be looked at from half a window before the song begins', async () => {
    render(<WaveformTool />)
    pickClickJob()

    fireEvent.wheel(document.querySelector('.align__strip') as HTMLElement, {
      deltaY: -10000,
      shiftKey: true
    })

    /* The click starts at -2.4, and there is half a window of air behind it. */
    await waitFor(() => expect((centreNow() as number) - SPAN / 2).toBeCloseTo(-2.4 - SPAN / 2, 6))
  })

  /* The whole complaint: the start marker coming in towards the music shortens
     the song from the left, and the view was shoved along after it — so the
     marker slid out from under the pointer that was placing it. */
  it('leaves the start under the pointer that is dragging it', async () => {
    render(<WaveformTool />)
    pickClickJob()

    dragStartTo(725)

    await waitFor(() => expect(startHandle().style.left).toBe('72.5%'))
  })

  it('stays put however far right the start is dragged', async () => {
    render(<WaveformTool />)
    pickClickJob()
    const before = centreNow()

    dragStartTo(400)
    dragStartTo(600)
    dragStartTo(830)

    expect(centreNow()).toBe(before)
  })

  /* Taking hold of a marker near an edge, or nudging one inward from there,
     must leave the view alone: only leaving the window moves it. */
  it('does not move for a start dragged up against the left edge', async () => {
    render(<WaveformTool />)
    pickClickJob()
    const before = centreNow()

    dragStartTo(5)

    expect(centreNow()).toBe(before)
  })

  /* The other half: a marker pushed off the left edge has to be followed, or
     it can only be put back by letting go and panning after it. Past the strip
     is where the pointer really goes — capture keeps the events coming. */
  it('follows the start out past the left edge', async () => {
    render(<WaveformTool />)
    pickClickJob()
    const before = centreNow() as number

    dragStartTo(-200)

    await waitFor(() => expect(centreNow() as number).toBeLessThan(before))
  })

  it('brings the start back just inside the edge rather than centring on it', async () => {
    render(<WaveformTool />)
    pickClickJob()

    dragStartTo(-200)

    await waitFor(() => {
      const at = (useSong.getState().song?.channels[1] as { startTime: number }).startTime
      const from = (centreNow() as number) - SPAN / 2
      expect(at - from).toBeCloseTo(SPAN * 0.02, 6)
    })
  })
})
