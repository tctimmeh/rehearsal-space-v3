// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { newSong, type Song } from '@core/song/song'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { installBridge } from '@renderer/testing/bridge'
import { installPointerCapture } from '@renderer/testing/pointer'
import { HeaderBar } from './HeaderBar'

const loaded = (): Song => ({ ...newSong('roll-on'), id: 'roll-on', title: 'Roll On' })

beforeEach(() => {
  installBridge()
  installPointerCapture()
  useSong.setState({ song: loaded(), songs: [], error: null, importing: false })
  useTransport.setState({ semitones: 0, cents: 0, speed: 1 })
})

afterEach(() => {
  cleanup()
  useSong.setState({ song: null })
  vi.clearAllMocks()
})

const face = () => screen.getByRole('button', { name: /^Pitch controls/ })

/**
 * Pitch is set once for a song, if at all, and then left alone — so it folds
 * away. What it may not do is go quiet: a shift left on by accident is a
 * baffling thing to listen to.
 */
describe('the pitch controls in the header', () => {
  it('keeps tempo out where it can be reached', () => {
    render(<HeaderBar />)

    expect(screen.getByLabelText('Tempo')).toBeTruthy()
  })

  it('folds the knobs away until they are asked for', () => {
    render(<HeaderBar />)

    expect(screen.queryByLabelText('Cents')).toBeNull()
  })

  it('shows them when it is', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)

    await user.click(face())

    expect(screen.getByLabelText('Semitones')).toBeTruthy()
    expect(screen.getByLabelText('Cents')).toBeTruthy()
  })

  /* The button carries the unit, so the readout beneath it need not. */
  it('leaves the unit to the button it folds out of', async () => {
    const user = userEvent.setup()
    useTransport.setState({ semitones: -2, cents: 0 })
    render(<HeaderBar />)

    await user.click(face())

    expect(screen.getByLabelText('Semitones').getAttribute('aria-valuetext')).toBe('−2')
    expect(face().textContent).toBe('−2 st')
  })

  it('says only "Pitch" while the song is at its own pitch', () => {
    render(<HeaderBar />)

    expect(face().textContent).toBe('Pitch')
  })

  it('says what the shift is when there is one', () => {
    useTransport.setState({ semitones: -2, cents: 0 })
    render(<HeaderBar />)

    expect(face().textContent).toBe('−2 st')
  })

  it('says both parts when the cents are shifted too', () => {
    useTransport.setState({ semitones: -2, cents: 15 })
    render(<HeaderBar />)

    expect(face().textContent).toBe('−2 st +15 ¢')
  })

  it('says the cents alone when that is all there is', () => {
    useTransport.setState({ semitones: 0, cents: -8 })
    render(<HeaderBar />)

    expect(face().textContent).toBe('−8 ¢')
  })

  it('folds away again on Escape', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await user.click(face())

    await user.keyboard('{Escape}')

    expect(screen.queryByLabelText('Cents')).toBeNull()
  })

  it('folds away again when something else is clicked', async () => {
    const user = userEvent.setup()
    render(<HeaderBar />)
    await user.click(face())

    await user.click(screen.getByLabelText('Tempo'))

    expect(screen.queryByLabelText('Cents')).toBeNull()
  })
})
