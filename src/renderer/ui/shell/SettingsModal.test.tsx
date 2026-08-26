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
  it('puts the two wheel settings side by side', () => {
    render(<SettingsModal onDismiss={() => undefined} />)
    const row = knob('Pan').closest('.setting-row')

    expect(row?.contains(knob('Zoom'))).toBe(true)
  })

  it('says what each knob is for without a line of prose beside it', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    expect(document.querySelectorAll('.setting-note')).toHaveLength(1)
    expect(screen.getByText(/Mouse wheel sensitivity/)).toBeTruthy()
  })

  it('shows each setting on a knob, reading what it is set to', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    expect(knob('Size').getAttribute('aria-valuetext')).toBe('120%')
    expect(knob('Pan').getAttribute('aria-valuetext')).toBe('10%')
    expect(knob('Zoom').getAttribute('aria-valuetext')).toBe('15%')
  })

  it('moves one point of what it reads per notch of the wheel', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    fireEvent.wheel(knob('Size'), { deltaY: -100 })

    expect(knob('Size').getAttribute('aria-valuetext')).toBe('121%')
  })

  it('moves one point the other way too, on every knob here', () => {
    render(<SettingsModal onDismiss={() => undefined} />)

    for (const [name, was] of [
      ['Size', '119%'],
      ['Pan', '9%'],
      ['Zoom', '14%']
    ] as const) {
      fireEvent.wheel(knob(name), { deltaY: 100 })
      expect(knob(name).getAttribute('aria-valuetext')).toBe(was)
    }
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
