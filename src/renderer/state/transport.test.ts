import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn((to: number) => {
    engine.position = to
  }),
  setBounds: vi.fn(),
  setLoop: vi.fn(),
  setSpeed: vi.fn(),
  setPitch: vi.fn(),
  whenEnded: vi.fn(),
  position: 0
}))

vi.mock('@renderer/audio/engine', () => ({ audioEngine: engine }))

const { useTransport } = await import('./transport')
const { useConfig } = await import('./config')

const autoReturn = (on: boolean) =>
  useConfig.setState({ config: { autoReturn: on } as never })

/** Played from `from`, and the playhead has reached `to`. */
const playFrom = (from: number, to: number) => {
  useTransport.setState({ position: from, playing: false })
  useTransport.getState().play()
  engine.position = to
  useTransport.setState({ position: to })
}

beforeEach(() => {
  useTransport.setState({
    playing: false,
    position: 0,
    start: 0,
    end: 120,
    playedFrom: null,
    loop: null,
    looping: false
  })
  autoReturn(false)
  engine.position = 0
  vi.clearAllMocks()
})

afterEach(() => {
  useConfig.setState({ config: null })
})

/**
 * The point of auto return is going over a passage again and again: stop, and
 * you are already where you need to be to go again.
 */
describe('auto return', () => {
  it('sends the playhead back where playing began, on pause', () => {
    autoReturn(true)
    playFrom(30, 45)

    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(30)
  })

  it('sends it back on stop too', () => {
    autoReturn(true)
    playFrom(30, 45)

    useTransport.getState().stop()

    expect(useTransport.getState().position).toBe(30)
  })

  it('leaves the playhead alone when it is off', () => {
    playFrom(30, 45)

    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(45)
  })

  it('still goes to the top on stop when it is off', () => {
    playFrom(30, 45)

    useTransport.getState().stop()

    expect(useTransport.getState().position).toBe(0)
  })

  it('goes back to the same place however many times it is played', () => {
    autoReturn(true)
    playFrom(30, 45)
    useTransport.getState().pause()

    useTransport.getState().play()
    useTransport.setState({ position: 51 })
    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(30)
  })

  /* Dropping the playhead somewhere is choosing a passage just as much as
     pressing play there is. */
  it('follows the playhead when it is scrubbed while playing', () => {
    autoReturn(true)
    playFrom(30, 45)

    useTransport.getState().seek(90)
    useTransport.setState({ position: 96 })
    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(90)
  })

  /* Sending the playhead back is itself a seek, and it must not count as
     choosing a passage or the mark would rewrite itself every time. */
  it('is not moved by its own sending back', () => {
    autoReturn(true)
    playFrom(30, 45)

    useTransport.getState().pause()

    expect(useTransport.getState().playedFrom).toBe(30)
  })

  it('is not moved by scrubbing while stopped, which is only navigating', () => {
    autoReturn(true)
    playFrom(30, 45)
    useTransport.getState().pause()

    useTransport.getState().seek(70)

    expect(useTransport.getState().playedFrom).toBe(30)
  })

  /* Otherwise there is no way back to the top of the song at all. */
  it('leaves stopping again to do what stopping has always done', () => {
    autoReturn(true)
    playFrom(30, 45)
    useTransport.getState().stop()

    useTransport.getState().stop()

    expect(useTransport.getState().position).toBe(0)
  })

  it('does nothing before anything has been played', () => {
    autoReturn(true)
    useTransport.setState({ position: 45 })

    useTransport.getState().stop()

    expect(useTransport.getState().position).toBe(0)
  })

  /* A count-in puts the top of the timeline before zero. */
  it('goes back to a negative mark as happily as any other', () => {
    autoReturn(true)
    useTransport.setState({ start: -4 })
    playFrom(-4, 20)

    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(-4)
  })
})

/**
 * A loop is for the eight bars that will not go right. The region belongs to
 * the song; going round it is something you start and stop.
 */
describe('looping', () => {
  const region = { start: 20, end: 30 }

  beforeEach(() => {
    useTransport.setState({ loop: region, looping: false })
  })

  it('cannot be started without a region to go round', () => {
    useTransport.setState({ loop: null })

    useTransport.getState().setLooping(true)

    expect(useTransport.getState().looping).toBe(false)
  })

  it('starts where the region does when the playhead is elsewhere', () => {
    useTransport.setState({ position: 5 })

    useTransport.getState().setLooping(true)

    expect(useTransport.getState().position).toBe(20)
    expect(useTransport.getState().looping).toBe(true)
  })

  it('leaves the playhead alone when it is already inside', () => {
    useTransport.setState({ position: 24 })

    useTransport.getState().setLooping(true)

    expect(useTransport.getState().position).toBe(24)
  })

  it('is given to the engine to schedule', () => {
    useTransport.getState().setLooping(true)

    expect(engine.setLoop).toHaveBeenCalledWith(region)
  })

  it('stops when the playhead is scrubbed out of the region', () => {
    useTransport.setState({ position: 24 })
    useTransport.getState().setLooping(true)

    useTransport.getState().seek(60)

    expect(useTransport.getState().looping).toBe(false)
    expect(engine.setLoop).toHaveBeenLastCalledWith(null)
  })

  it('carries on when the playhead is scrubbed within the region', () => {
    useTransport.setState({ position: 24 })
    useTransport.getState().setLooping(true)

    useTransport.getState().seek(28)

    expect(useTransport.getState().looping).toBe(true)
  })

  it('stops when the song is stopped', () => {
    useTransport.setState({ position: 24 })
    useTransport.getState().setLooping(true)

    useTransport.getState().stop()

    expect(useTransport.getState().looping).toBe(false)
  })

  /* Auto return puts the playhead back inside the region, so there is no
     reason to have stopped going round it. */
  it('carries on through a pause that returns into the region', () => {
    autoReturn(true)
    useTransport.setState({ position: 22, playing: false })
    useTransport.getState().play()
    useTransport.getState().setLooping(true)
    useTransport.setState({ position: 29 })

    useTransport.getState().pause()

    expect(useTransport.getState().position).toBe(22)
    expect(useTransport.getState().looping).toBe(true)
  })

  it('keeps the region when it is switched off', () => {
    useTransport.getState().setLooping(true)

    useTransport.getState().setLooping(false)

    expect(useTransport.getState().loop).toEqual(region)
    expect(engine.setLoop).toHaveBeenLastCalledWith(null)
  })

  it('is given up when the region itself goes', () => {
    useTransport.setState({ position: 24 })
    useTransport.getState().setLooping(true)

    useTransport.getState().setLoop(null)

    expect(useTransport.getState().looping).toBe(false)
  })
})
