// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const service = vi.hoisted(() => {
  let emit: ((heard: { frequency: number | null; clarity: number; level: number }) => void) | null =
    null
  return {
    started: [] as { deviceId: string; channel: number }[],
    stops: 0,
    failure: null as Error | null,
    start: vi.fn(async (deviceId: string, channel: number) => {
      if (service.failure !== null) throw service.failure
      service.started.push({ deviceId, channel })
    }),
    stop: vi.fn(() => {
      service.stops += 1
    }),
    listen: vi.fn((listener: typeof emit) => {
      emit = listener
      return () => {
        emit = null
      }
    }),
    hear(frequency: number | null, level = 0.2) {
      emit?.({ frequency, clarity: frequency === null ? 0 : 0.9, level })
    }
  }
})

vi.mock('@renderer/audio/tuner', () => ({ tuner: service }))

const { useTuner, startListening, stopListening, followTuner } = await import('./tuner')
const { useConfig } = await import('./config')

let unwire = () => undefined as void

beforeEach(() => {
  service.started = []
  service.stops = 0
  service.failure = null
  useTuner.setState({ status: 'off', note: null, frequency: null, fading: false, level: 0 })
  useConfig.setState({
    config: {
      libraryPath: '/songs',
      lastSongId: null,
      uiScale: 1.2,
      panSpeed: 0.1,
      zoomSpeed: 0.15,
      inputDeviceId: 'rubix',
      inputChannel: 2,
      metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'tick' },
      toolPaths: {}
    }
  })
  unwire = followTuner()
})

afterEach(() => {
  unwire()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('listening', () => {
  it('uses the input the app is set to record from', async () => {
    await startListening()

    expect(service.started).toEqual([{ deviceId: 'rubix', channel: 2 }])
    expect(useTuner.getState().status).toBe('listening')
  })

  it('says so when the input will not open, rather than looking deaf', async () => {
    service.failure = new Error('NotAllowedError')

    await startListening()

    expect(useTuner.getState().status).toBe('deaf')
  })

  it('lets the microphone go when it is done', async () => {
    await startListening()
    stopListening()

    expect(service.stops).toBeGreaterThan(0)
    expect(useTuner.getState().status).toBe('off')
  })
})

/** Readings arrive twenty a second; the needle waits for a few that agree. */
const settleOn = (hz: number, readings = 40) => {
  for (let reading = 0; reading < readings; reading += 1) service.hear(hz)
}

describe('what it reports', () => {
  it('names the note it hears', async () => {
    await startListening()

    settleOn(110)

    expect(useTuner.getState().note).toMatchObject({ name: 'A', octave: 2 })
  })

  it('says nothing until the pitch has held still', async () => {
    await startListening()

    service.hear(110)
    service.hear(110)

    expect(useTuner.getState().note).toBeNull()
  })

  it('steadies a wavering string instead of showing every window', async () => {
    await startListening()

    settleOn(110)
    for (const hz of [109.6, 110.4, 110, 109.8, 110.2]) service.hear(hz)

    expect(useTuner.getState().frequency).toBeCloseTo(110, 1)
  })

  it('does not answer every flicker of the string', async () => {
    await startListening()
    settleOn(110)

    const shown: number[] = []
    for (const hz of [110.5, 109.5, 110.4, 109.6, 110.3]) {
      service.hear(hz)
      shown.push(useTuner.getState().frequency as number)
    }

    const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(spread(shown)).toBeLessThan(0.2)
  })

  it('is not thrown by one window that heard an octave up', async () => {
    await startListening()

    settleOn(110)
    for (const hz of [110, 220, 110, 110]) service.hear(hz)

    expect(useTuner.getState().note).toMatchObject({ name: 'A', octave: 2 })
  })

  /* Struck again, the same string has nothing new to say. */
  it('does not move when the string is plucked again', async () => {
    await startListening()
    settleOn(110)
    const before = useTuner.getState().frequency as number

    /* The attack is sharp and slides back down. */
    for (const cents of [13, 11, 9.2, 7.8, 6.6, 5.6, 4.7, 4]) {
      service.hear(110 * 2 ** (cents / 1200))
    }

    const after = useTuner.getState().frequency as number
    expect(Math.abs(1200 * Math.log2(after / before))).toBeLessThan(1)
  })
})

/**
 * A plucked string dies away. Blanking the display the moment it does leaves
 * nothing to read at exactly the moment somebody looks up from the peg.
 */
describe('a note dying away', () => {
  it('holds the last note, marked as a memory', async () => {
    await startListening()
    settleOn(110)

    service.hear(null)

    expect(useTuner.getState().note).toMatchObject({ name: 'A' })
    expect(useTuner.getState().fading).toBe(true)
  })

  it('lets go once the silence has gone on', async () => {
    vi.useFakeTimers()
    await startListening()
    settleOn(110)

    vi.advanceTimersByTime(1500)
    vi.setSystemTime(Date.now() + 1500)
    service.hear(null)

    expect(useTuner.getState().note).toBeNull()
    expect(useTuner.getState().fading).toBe(false)
  })

  it('shows nothing at all before anything has been played', async () => {
    await startListening()

    service.hear(null)

    expect(useTuner.getState().note).toBeNull()
    expect(useTuner.getState().fading).toBe(false)
  })

  it('starts a fresh reading after the silence rather than averaging across it', async () => {
    vi.useFakeTimers()
    await startListening()
    settleOn(110)

    vi.setSystemTime(Date.now() + 5000)
    service.hear(null)
    settleOn(220)

    expect(useTuner.getState().note).toMatchObject({ name: 'A', octave: 3 })
  })
})
