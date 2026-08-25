// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useMetronome } from '@renderer/state/metronome'
import { installBridge } from '@renderer/testing/bridge'
import { MetronomeGadget } from './MetronomeGadget'

vi.mock('@renderer/audio/engine', () => ({
  audioEngine: { clicksReady: () => Promise.resolve() }
}))
vi.mock('@renderer/audio/standaloneMetronome', () => ({
  standaloneMetronome: {
    start: vi.fn(async () => undefined),
    update: vi.fn(),
    stop: vi.fn(),
    listen: () => () => undefined,
    clock: { currentTime: 0, outputLatency: 0, baseLatency: 0 }
  }
}))

const config = (metronome: Partial<AppConfig['metronome']> = {}): AppConfig => ({
  libraryPath: '/songs',
  lastSongId: null,
  uiScale: 1.2,
  showCents: false,
  panSpeed: 0.1,
  zoomSpeed: 0.15,
  inputDeviceId: '',
  inputChannel: 0,
  metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'tick', ...metronome },
  toolPaths: {}
})

beforeEach(() => {
  installBridge()
  useMetronome.setState({ running: false, beat: -1 })
  useConfig.setState({
    config: config(),
    set: async (patch) => {
      const current = useConfig.getState().config
      if (current !== null) useConfig.setState({ config: { ...current, ...patch } })
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const beats = () => [...document.querySelectorAll('.metro__beat')] as HTMLElement[]

describe('the beat indicator', () => {
  it('shows a line for each beat of the measure', () => {
    useConfig.setState({ config: config({ beatsPerMeasure: 3 }) })
    render(<MetronomeGadget />)

    expect(beats()).toHaveLength(3)
  })

  it('lights the beat being counted, and only that one', () => {
    useMetronome.setState({ running: true, beat: 5 })
    render(<MetronomeGadget />)

    /* Beat 5 of a four-beat measure is the second one. */
    expect(beats().map((beat) => beat.dataset['lit'])).toEqual([
      'false',
      'true',
      'false',
      'false'
    ])
  })

  it('is dark when nothing is running, whatever beat it stopped on', () => {
    useMetronome.setState({ running: false, beat: 2 })
    render(<MetronomeGadget />)

    expect(beats().every((beat) => beat.dataset['lit'] === 'false')).toBe(true)
  })

  it('marks the accented beat only when the accent is on', () => {
    render(<MetronomeGadget />)
    expect(beats()[0]?.dataset['accent']).toBe('true')

    cleanup()
    useConfig.setState({ config: config({ accentFirstBeat: false }) })
    render(<MetronomeGadget />)
    expect(beats()[0]?.dataset['accent']).toBe('false')
  })
})

describe('the controls', () => {
  it('nudges the tempo by one', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await user.click(screen.getByRole('button', { name: 'Faster' }))

    expect(useConfig.getState().config?.metronome.bpm).toBe(101)
  })

  it('will not be driven to a tempo that is a drone or a blur', async () => {
    const user = userEvent.setup()
    useConfig.setState({ config: config({ bpm: 20 }) })
    render(<MetronomeGadget />)

    await user.click(screen.getByRole('button', { name: 'Slower' }))

    expect(useConfig.getState().config?.metronome.bpm).toBe(20)
  })

  it('keeps the chosen sound', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Sound' }), 'Rim')

    expect(useConfig.getState().config?.metronome.sample).toBe('rim')
  })

  it('says what pressing it will do', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDefined()

    await user.click(screen.getByRole('button', { name: 'Start' }))

    expect(useMetronome.getState().running).toBe(true)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeDefined()
  })
})
