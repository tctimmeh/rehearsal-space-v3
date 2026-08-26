// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  PAN_SPEED_DEFAULT,
  UI_SCALE_DEFAULT,
  UI_SCALE_MAX,
  ZOOM_SPEED_DEFAULT,
  type AppConfig
} from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { SettingsModal } from './SettingsModal'

const config = (patch: Partial<AppConfig> = {}): AppConfig => ({
  libraryPath: '/songs',
  lastSongId: null,
  uiScale: UI_SCALE_DEFAULT,
  showCents: false,
  panSpeed: PAN_SPEED_DEFAULT,
  zoomSpeed: ZOOM_SPEED_DEFAULT,
  inputDeviceId: '',
  inputChannel: 0,
  metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'tick' },
  toolPaths: {},
  ...patch
})

const kept: Record<string, unknown>[] = []

beforeEach(() => {
  installBridge()
  kept.length = 0
  useSong.setState({ songs: [], song: null })
  useConfig.setState({
    config: config(),
    set: async (patch) => {
      kept.push(patch as Record<string, unknown>)
      const current = useConfig.getState().config
      if (current !== null) useConfig.setState({ config: { ...current, ...patch } })
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const knob = (name: string) => screen.getByRole('slider', { name })

/** The same control as the tempo and pitch knobs in the header. */
describe('the settings knobs', () => {
  it('shows each setting on a knob, reading what it is set to', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    expect(knob('Size').getAttribute('aria-valuetext')).toBe('120%')
    expect(knob('Pan').getAttribute('aria-valuetext')).toBe('10%')
    expect(knob('Zoom').getAttribute('aria-valuetext')).toBe('15%')
  })

  it('turns with the wheel, a step at a time', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    fireEvent.wheel(knob('Size'), { deltaY: -100 })

    expect(useConfig.getState().config?.uiScale).toBeCloseTo(1.25, 3)
  })

  it('turns the other way too', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    fireEvent.wheel(knob('Zoom'), { deltaY: 100 })

    expect(useConfig.getState().config?.zoomSpeed).toBeCloseTo(0.1, 3)
  })

  it('goes no further than the setting allows', () => {
    useConfig.setState({ config: config({ uiScale: UI_SCALE_MAX }) })
    render(<SettingsModal onDismiss={() => undefined} />)

    fireEvent.wheel(knob('Size'), { deltaY: -100 })

    expect(useConfig.getState().config?.uiScale).toBe(UI_SCALE_MAX)
  })

  it('goes back to where it started on a double-click', async () => {
    const user = userEvent.setup()
    useConfig.setState({ config: config({ panSpeed: 0.4 }) })
    render(<SettingsModal onDismiss={() => undefined} />)

    await user.dblClick(knob('Pan'))

    expect(useConfig.getState().config?.panSpeed).toBe(PAN_SPEED_DEFAULT)
  })

  it('writes a value the config file can hold, not a long fraction', () => {
    useConfig.setState({ config: config({ zoomSpeed: 0.3 }) })
    render(<SettingsModal onDismiss={() => undefined} />)

    fireEvent.wheel(knob('Zoom'), { deltaY: -100 })

    for (const patch of kept) {
      for (const value of Object.values(patch)) {
        expect(String(value)).not.toMatch(/\.\d{4,}/)
      }
    }
  })
})
