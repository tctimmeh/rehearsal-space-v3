// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useMetronome } from '@renderer/state/metronome'
import { installBridge } from '@renderer/testing/bridge'
import { MetronomeGadget } from './MetronomeGadget'

const clock = vi.hoisted(() => ({ currentTime: 0 }))

vi.mock('@renderer/audio/engine', () => ({
  audioEngine: { clicksReady: () => Promise.resolve() }
}))
vi.mock('@renderer/audio/standaloneMetronome', () => ({
  standaloneMetronome: {
    start: vi.fn(async () => undefined),
    update: vi.fn(),
    tapTo: vi.fn(),
    stop: vi.fn(),
    listen: () => () => undefined,
    clock
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
  clock.currentTime = 0
  useMetronome.setState({ tapping: 0 })
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

  it('sits at the end of the row, where growing pushes nothing about', () => {
    render(<MetronomeGadget />)
    const row = beats()[0]?.parentElement?.parentElement as HTMLElement
    const last = row.lastElementChild as HTMLElement

    expect(last.className).toContain('metro__beats')
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

    await user.click(screen.getByRole('button', { name: 'Metronome setup' }))
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

/**
 * Nobody is going to click sixty times to get from 100 to 160.
 */
describe('holding the tempo buttons', () => {
  it('keeps going while held, and stops when let go', async () => {
    vi.useFakeTimers()
    render(<MetronomeGadget />)
    const faster = screen.getByRole('button', { name: 'Faster' })

    fireEvent.pointerDown(faster, { button: 0 })
    expect(useConfig.getState().config?.metronome.bpm).toBe(101)

    await act(async () => {
      vi.advanceTimersByTime(420 + 110 * 3)
    })
    const held = useConfig.getState().config?.metronome.bpm ?? 0
    expect(held).toBeGreaterThan(103)

    fireEvent.pointerUp(faster)
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(useConfig.getState().config?.metronome.bpm).toBe(held)
    vi.useRealTimers()
  })

  it('winds up rather than crawling', async () => {
    vi.useFakeTimers()
    render(<MetronomeGadget />)
    const faster = screen.getByRole('button', { name: 'Faster' })

    fireEvent.pointerDown(faster, { button: 0 })
    await act(async () => {
      vi.advanceTimersByTime(420 + 110 * 6)
    })
    const early = useConfig.getState().config?.metronome.bpm ?? 0
    await act(async () => {
      vi.advanceTimersByTime(110 * 6)
    })
    const later = useConfig.getState().config?.metronome.bpm ?? 0

    /* The same span of time buys more steps once it has wound up. */
    expect(later - early).toBeGreaterThan(early - 101)
    vi.useRealTimers()
  })
})

/**
 * Tapping a tempo in is how anybody who plays with other people finds one.
 */
describe('tapping a tempo', () => {
  const tapAt = async (user: ReturnType<typeof userEvent.setup>, seconds: number[]) => {
    for (const at of seconds) {
      clock.currentTime = at
      await user.click(screen.getByRole('button', { name: /^Tap/ }))
    }
  }

  it('says nothing from one tap, since one tap is not a tempo', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await tapAt(user, [1])

    expect(useConfig.getState().config?.metronome.bpm).toBe(100)
  })

  it('takes the tempo from four taps in time', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await tapAt(user, [1, 1.5, 2, 2.5])

    expect(useConfig.getState().config?.metronome.bpm).toBe(120)
  })

  it('counts the taps so far, so a tap that registered can be seen to have', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await tapAt(user, [1, 1.5])

    expect(screen.getByRole('button', { name: 'Tap 2' })).toBeDefined()
  })

  it('starts a fresh count after a pause too long to be a beat', async () => {
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await tapAt(user, [1, 1.5, 2])
    await tapAt(user, [20, 21])

    /* The 19-second pause is not a beat: this is 60 bpm, not something slower. */
    expect(useConfig.getState().config?.metronome.bpm).toBe(60)
  })

  it('puts the beat where the tapping was', async () => {
    const { standaloneMetronome } = await import('@renderer/audio/standaloneMetronome')
    const user = userEvent.setup()
    render(<MetronomeGadget />)

    await tapAt(user, [1, 1.5, 2])

    expect(standaloneMetronome.tapTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ bpm: 120 }),
      2
    )
  })
})
