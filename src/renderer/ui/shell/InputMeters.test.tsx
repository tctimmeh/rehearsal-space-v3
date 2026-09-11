// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ALL_INPUTS } from '@core/audio/inputChannels'
import type { AppConfig } from '@shared/config'
import { DEFAULT_NUDGE } from '@core/keys/hotkeys'
import { DEFAULT_NEEDLE } from '@core/music/steady'
import { ENGAGED_COLOR_DEFAULT } from '@core/ui/accents'
import { useConfig } from '@renderer/state/config'
import { useRecording } from '@renderer/state/recording'
import { useSong } from '@renderer/state/song'
import { InputMeters } from './InputMeters'

const config = (inputChannel: number): AppConfig => ({
  libraryPath: '/songs',
  lastSongId: null,
  uiScale: 1.2,
  engagedColor: ENGAGED_COLOR_DEFAULT,
  panSpeed: 0.1,
  zoomSpeed: 0.15,
  inputDeviceId: '',
  inputChannel,
  metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'beep' },
  autoReturn: false,
  tuner: DEFAULT_NEEDLE,
  nudge: DEFAULT_NUDGE,
  toolPaths: {}
})

/** The recorder's listeners, so a test can push levels the way it does. */
let heard: ((levels: readonly number[]) => void)[] = []

beforeEach(() => {
  heard = []
  useConfig.setState({ config: config(ALL_INPUTS) })
  useRecording.setState({ phase: 'off' })
  useSong.setState({
    listenToInput: (listener) => {
      heard.push(listener)
      return () => {
        heard = heard.filter((one) => one !== listener)
      }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const tracks = () => [...document.querySelectorAll('.meters-strip__track')]
const fills = () =>
  tracks().map((track) => track.querySelector('.meters-strip__fill') as HTMLElement)
const say = (levels: number[]) => act(() => heard.forEach((listener) => listener(levels)))

/**
 * Setting a level before playing rather than after: a take that turns out to
 * have been clipping, or of nothing at all, is a take played again.
 */
describe('the input meters', () => {
  it('shows one for each socket', () => {
    render(<InputMeters onOpen={() => undefined} />)

    expect(tracks()).toHaveLength(2)
  })

  /* Nothing is arriving while nothing is armed, so nothing is listened for. */
  it('listens to nothing until something is armed', () => {
    render(<InputMeters onOpen={() => undefined} />)

    expect(heard).toHaveLength(0)
  })

  it('follows the input once it is armed', () => {
    useRecording.setState({ phase: 'armed' })
    render(<InputMeters onOpen={() => undefined} />)

    say([0.5, 0.25])

    expect(fills()[0]?.style.transform).not.toBe('scaleY(0)')
    expect(fills()[1]?.style.transform).not.toBe(fills()[0]?.style.transform)
  })

  it('keeps following while a take is running', () => {
    useRecording.setState({ phase: 'recording' })
    render(<InputMeters onOpen={() => undefined} />)

    say([0.5, 0.5])

    expect(fills()[0]?.style.transform).not.toBe('scaleY(0)')
  })

  /* Disarming stops the meters where they are otherwise, which reads as an
     input still hearing something that is no longer open. */
  it('falls back to nothing when the input is let go of', () => {
    useRecording.setState({ phase: 'armed' })
    const { rerender } = render(<InputMeters onOpen={() => undefined} />)
    say([0.8, 0.8])

    act(() => useRecording.setState({ phase: 'off' }))
    rerender(<InputMeters onOpen={() => undefined} />)

    expect(fills()[0]?.style.transform).toBe('scaleY(0)')
    expect(heard).toHaveLength(0)
  })

  /* A socket that will not be kept still shows what it hears — it is how you
     find out you have plugged into the wrong one. */
  it('marks which sockets are going to be recorded', () => {
    useConfig.setState({ config: config(2) })
    render(<InputMeters onOpen={() => undefined} />)

    expect(tracks().map((one) => (one as HTMLElement).dataset['recorded'])).toEqual([
      'false',
      'true'
    ])
  })

  it('marks both when both are being taken', () => {
    useConfig.setState({ config: config(ALL_INPUTS) })
    render(<InputMeters onOpen={() => undefined} />)

    expect(tracks().map((one) => (one as HTMLElement).dataset['recorded'])).toEqual([
      'true',
      'true'
    ])
  })

  it('says it is dark because nothing is armed', () => {
    render(<InputMeters onOpen={() => undefined} />)

    expect(screen.getByRole('button', { name: 'Input levels' }).dataset['armed']).toBe('false')
  })

  /* Choosing the input is the dialog's job; this is a way into it. */
  it('opens the recording dialog when it is pressed', async () => {
    const user = userEvent.setup()
    const opened = vi.fn()
    render(<InputMeters onOpen={opened} />)

    await user.click(screen.getByRole('button', { name: 'Input levels' }))

    expect(opened).toHaveBeenCalledOnce()
  })
})
