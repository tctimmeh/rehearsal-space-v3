import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const engine = vi.hoisted(() => ({
  play: vi.fn(async () => true),
  pause: vi.fn(),
  stop: vi.fn(),
  seek: vi.fn((to: number) => {
    engine.position = to
  }),
  setBounds: vi.fn(),
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
  useTransport.setState({ playing: false, position: 0, start: 0, end: 120, playedFrom: null })
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
