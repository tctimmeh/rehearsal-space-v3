// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig, MetronomeSettings } from '@shared/config'
import { installBridge } from '@renderer/testing/bridge'
import { useConfig } from './config'

/* Only the metronome is read here, so only the metronome is stood up. */
const tempo = (bpm: number): MetronomeSettings => ({
  bpm,
  beatsPerMeasure: 4,
  accentFirstBeat: true,
  sample: 'tick'
})

const stored = (bpm: number) => ({ metronome: tempo(bpm) }) as unknown as AppConfig

beforeEach(() => {
  installBridge()
  useConfig.setState({ config: stored(100) })
})

afterEach(() => {
  useConfig.setState({ config: null })
  vi.clearAllMocks()
})

/*
 * Writing a setting is a trip to the main process. A knob turned or a key
 * held moves faster than one comes back, and everything that steps a setting
 * reads the current one to step from — so until the change is kept here, the
 * second step in a row is reckoned from the value before the first.
 */
describe('changing a setting', () => {
  it('is known here before the answer comes back', () => {
    let answer = (_config: unknown) => undefined as void
    window.rehearsal.config.set = vi.fn(
      () => new Promise((resolve) => (answer = resolve as typeof answer))
    ) as never

    void useConfig.getState().set({ metronome: tempo(101) })

    expect(useConfig.getState().config?.metronome.bpm).toBe(101)
    answer(stored(101))
  })

  it('so two changes in a row both count', async () => {
    window.rehearsal.config.set = vi.fn(async (patch) => ({
      ...(useConfig.getState().config as object),
      ...patch
    })) as never

    const step = () => {
      const bpm = useConfig.getState().config?.metronome.bpm ?? 0
      return useConfig.getState().set({ metronome: tempo(bpm + 1) })
    }
    const both = Promise.all([step(), step()])

    expect(useConfig.getState().config?.metronome.bpm).toBe(102)
    await both
  })

  /* The main process is what clamps anything out of range, so its answer is
     the one that stands. */
  it('takes what the main process says over what was asked for', async () => {
    window.rehearsal.config.set = vi.fn(async () => stored(300)) as never

    await useConfig.getState().set({ metronome: tempo(9000) })

    expect(useConfig.getState().config?.metronome.bpm).toBe(300)
  })
})
