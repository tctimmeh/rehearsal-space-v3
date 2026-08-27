// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '@shared/config'
import { newSong, type Song } from '@core/song/song'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { installBridge } from '@renderer/testing/bridge'
import { installPointerCapture } from '@renderer/testing/pointer'
import { HeaderBar } from './HeaderBar'

const loaded = (): Song => ({ ...newSong('roll-on'), id: 'roll-on', title: 'Roll On' })

const kept: Partial<AppConfig>[] = []

beforeEach(() => {
  installBridge()
  installPointerCapture()
  kept.length = 0
  useSong.setState({ song: loaded(), songs: [], error: null, importing: false })
  useConfig.setState({
    config: { autoReturn: false } as AppConfig,
    set: async (patch) => {
      kept.push(patch)
      useConfig.setState((state) => ({ config: { ...state.config, ...patch } as AppConfig }))
    }
  })
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null })
  useConfig.setState({ config: null })
  vi.clearAllMocks()
})

const toggle = () => screen.getByRole('button', { name: /^Auto return/ })

describe('the auto return toggle', () => {
  it('sits between the transport and the tempo knob', () => {
    render(<HeaderBar />)

    const bar = toggle().closest('header') as HTMLElement
    const order = [...bar.querySelectorAll('.transport, .icon-btn, .knobs')]

    expect(order.indexOf(toggle())).toBeGreaterThan(
      order.indexOf(bar.querySelector('.transport') as Element)
    )
    expect(order.indexOf(toggle())).toBeLessThan(
      order.indexOf(bar.querySelector('.knobs') as Element)
    )
  })

  it('starts off', () => {
    render(<HeaderBar />)

    expect(toggle().getAttribute('aria-pressed')).toBe('false')
  })

  it('turns on when pressed, and says so', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await user.click(toggle())

    expect(kept).toEqual([{ autoReturn: true }])
    expect(toggle().getAttribute('aria-pressed')).toBe('true')
  })

  /* A latch, so it reads as engaged the way everything pressed does. */
  it('shows itself engaged while it is on', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await user.click(toggle())

    expect(toggle().getAttribute('data-engaged')).toBe('true')
  })

  it('turns off again', async () => {
    const user = userEvent.setup()
    useConfig.setState({ config: { autoReturn: true } as AppConfig })
    render(<HeaderBar />)

    await user.click(toggle())

    expect(kept).toEqual([{ autoReturn: false }])
  })
})
