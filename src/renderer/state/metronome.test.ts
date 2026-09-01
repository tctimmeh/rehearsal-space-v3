// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_NUDGE } from '@core/keys/hotkeys'
import { DEFAULT_NEEDLE } from '@core/music/steady'

const clicker = vi.hoisted(() => ({
  started: [] as unknown[],
  updated: [] as unknown[],
  stops: 0,
  start: vi.fn(async (settings: unknown) => {
    clicker.started.push(settings)
  }),
  update: vi.fn((settings: unknown) => {
    clicker.updated.push(settings)
  }),
  stop: vi.fn(() => {
    clicker.stops += 1
  }),
  listen: vi.fn(() => () => undefined),
  clock: { currentTime: 0, outputLatency: 0, baseLatency: 0 }
}))

vi.mock('@renderer/audio/standaloneMetronome', () => ({ standaloneMetronome: clicker }))

const { useMetronome } = await import('./metronome')
const { useConfig } = await import('./config')
const { useTools } = await import('./tools')

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const kept: Record<string, unknown>[] = []

beforeEach(() => {
  kept.length = 0
  clicker.started = []
  clicker.updated = []
  clicker.stops = 0
  useMetronome.setState({ running: false, beat: -1 })
  useConfig.setState({
    config: {
      libraryPath: '/songs',
      lastSongId: null,
      uiScale: 1.2,
      panSpeed: 0.1,
      zoomSpeed: 0.15,
      inputDeviceId: '',
      inputChannel: 0,
      metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'woodblock' },
  autoReturn: false,
  tuner: DEFAULT_NEEDLE,
  nudge: DEFAULT_NUDGE,
      toolPaths: {}
    },
    /* Saving keeps the patch and answers with the config it produces. */
    set: async (patch) => {
      kept.push(patch as Record<string, unknown>)
      const current = useConfig.getState().config
      if (current !== null) useConfig.setState({ config: { ...current, ...patch } })
    }
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('starting and stopping', () => {
  it('starts with the settings it was left with', async () => {
    useMetronome.getState().toggle()
    await settled()

    expect(useMetronome.getState().running).toBe(true)
    expect(clicker.started).toEqual([
      { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'woodblock' }
    ])
  })

  it('stops on a second press', async () => {
    useMetronome.getState().toggle()
    await settled()
    useMetronome.getState().toggle()

    expect(useMetronome.getState().running).toBe(false)
    expect(clicker.stops).toBe(1)
  })

  it('forgets which beat it was on, so it starts counting again', async () => {
    useMetronome.setState({ beat: 3 })
    useMetronome.getState().toggle()
    await settled()

    expect(useMetronome.getState().beat).toBe(-1)
  })
})

/**
 * Where it was left is where it comes back — the sound above all, which is a
 * matter of taste nobody wants to set twice.
 */
describe('settings', () => {
  it('are kept in the app config, not in the tool', () => {
    useMetronome.getState().change({ bpm: 132 })

    expect(kept).toEqual([
      { metronome: { bpm: 132, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'woodblock' } }
    ])
  })

  it('reach a metronome that is already running', async () => {
    useMetronome.getState().toggle()
    await settled()
    useMetronome.getState().change({ bpm: 88 })

    expect(clicker.updated).toEqual([
      { bpm: 88, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'woodblock' }
    ])
  })

  it('do not start a metronome that is off', () => {
    useMetronome.getState().change({ sample: 'hat' })

    expect(clicker.update).not.toHaveBeenCalled()
    expect(clicker.start).not.toHaveBeenCalled()
  })

  it('change one thing without disturbing the rest', () => {
    useMetronome.getState().change({ beatsPerMeasure: 3 })
    useMetronome.getState().change({ accentFirstBeat: false })

    expect(useConfig.getState().config?.metronome).toEqual({
      bpm: 100,
      beatsPerMeasure: 3,
      accentFirstBeat: false,
      sample: 'woodblock'
    })
  })
})

describe('putting the tool away', () => {
  it('stops a click that would otherwise have nothing to stop it', async () => {
    const { followMetronomeBeats } = await import('./metronome')
    const unwire = followMetronomeBeats()
    useTools.setState((state) => ({ open: { ...state.open, metronome: true } }))
    useMetronome.getState().toggle()
    await settled()

    useTools.getState().close('metronome')

    expect(useMetronome.getState().running).toBe(false)
    unwire()
  })
})
