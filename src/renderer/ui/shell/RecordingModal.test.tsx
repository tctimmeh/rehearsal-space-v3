// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { installBridge } from '@renderer/testing/bridge'
import { RecordingModal } from './RecordingModal'

const fake = vi.hoisted(() => {
  const listeners = new Set<(levels: readonly number[]) => void>()
  const monitor = {
    opened: [] as string[],
    stopped: 0,
    result: { name: 'Rubix22 Analog Stereo', channels: 2 } as { name: string; channels: number },
    failure: null as Error | null,
    start(deviceId: string) {
      monitor.opened.push(deviceId)
      return monitor.failure === null
        ? Promise.resolve(monitor.result)
        : Promise.reject(monitor.failure)
    },
    listen(listener: (levels: readonly number[]) => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    stop() {
      monitor.stopped += 1
      listeners.clear()
    },
    listening() {
      return listeners.size
    },
    hear(levels: number[]) {
      for (const listener of [...listeners]) listener(levels)
    },
    reset() {
      listeners.clear()
      monitor.opened = []
      monitor.stopped = 0
      monitor.result = { name: 'Rubix22 Analog Stereo', channels: 2 }
      monitor.failure = null
    }
  }
  return monitor
})

vi.mock('@renderer/audio/inputMonitor', () => ({
  InputMonitor: class {
    start = fake.start
    listen = fake.listen
    stop = fake.stop
  }
}))

vi.mock('@renderer/audio/recorder', () => ({
  inputDevices: async () => [
    { deviceId: 'rubix', label: 'Rubix22 Analog Stereo', kind: 'audioinput' }
  ]
}))

const config = (patch: Partial<AppConfig> = {}): AppConfig => ({
  libraryPath: '/songs',
  lastSongId: null,
  uiScale: 1.2,
  showCents: false,
  panSpeed: 0.1,
  zoomSpeed: 0.15,
  inputDeviceId: '',
  inputChannel: 0,
  metronome: { bpm: 100, beatsPerMeasure: 4, accentFirstBeat: true, sample: 'tick' },
  toolPaths: {},
  ...patch
})

beforeEach(() => {
  installBridge()
  fake.reset()
  useConfig.setState({ config: config() })
  /* Saving a preference answers with the config as it now stands, the way the
     main process does — otherwise a choice never comes back to the dialog. */
  vi.mocked(window.rehearsal.config.set).mockImplementation(async (patch) => ({
    ...(useConfig.getState().config ?? config()),
    ...patch
  }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/* Scoped to what this render put on the page: a document-wide query can pick
   up a meter from a render that has not been torn down yet. */
let page: HTMLElement = document.body

const show = () => {
  const view = render(<RecordingModal onDismiss={() => undefined} />)
  page = view.baseElement as HTMLElement
  return view
}

const settledChannelPicker = async () => {
  const picker = screen.getByRole('combobox', { name: 'Channels' }) as HTMLSelectElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  return picker
}

const meters = () => [...page.querySelectorAll('.meter')] as HTMLElement[]
const fillOf = (meter: HTMLElement) => meter.querySelector('.meter__fill') as HTMLElement

/**
 * Waits for the meters to be listening, not merely on the page. A meter
 * subscribes in an effect, and under load React commits the markup a moment
 * before it runs them — so a level emitted in between reaches nobody.
 */
const metersListening = async (count = 2) => {
  await waitFor(() => expect(meters()).toHaveLength(count))
  await waitFor(() => expect(fake.listening()).toBe(count))
}

/**
 * Nothing reports how many sockets a device has. A laptop's built-in
 * microphone array and a two-input interface both arrive as two channels of
 * different sound, so the picker describes the stream it can see rather than
 * hardware it would have to guess at.
 */
describe('choosing what to record', () => {
  it('offers nothing to choose when the capture is mono', async () => {
    fake.result = { name: 'Built-in Microphone', channels: 1 }
    show()

    const picker = screen.getByRole('combobox', { name: 'Channels' }) as HTMLSelectElement
    await waitFor(() => expect([...picker.options]).toHaveLength(1))
    expect(picker.disabled).toBe(true)
    expect(picker.options[0]?.text).toBe('The only channel')
  })

  it('offers each side of a stereo capture, and never claims to count sockets', async () => {
    show()

    const picker = await settledChannelPicker()
    expect([...picker.options].map((option) => option.text)).toEqual([
      'Both together',
      'Left only',
      'Right only'
    ])
  })

  it('keeps the whole capture until told otherwise', async () => {
    show()

    expect((await settledChannelPicker()).value).toBe('0')
  })

  it('passes the chosen side on to be saved', async () => {
    const user = userEvent.setup()
    show()

    await user.selectOptions(await settledChannelPicker(), 'Right only')

    expect(window.rehearsal.config.set).toHaveBeenCalledWith({ inputChannel: 2 })
  })
})

describe('the system default', () => {
  it('names the device it currently resolves to', async () => {
    show()

    await screen.findByText(/right now that is Rubix22 Analog Stereo/)
  })

  it('says so plainly when a named device has gone away', async () => {
    useConfig.setState({ config: config({ inputDeviceId: 'rubix' }) })
    fake.failure = new Error('NotFoundError')
    show()

    await screen.findByText('not available right now')
  })
})

/**
 * The point of the meters is answering "is anything arriving, and on which
 * channel" without having to make a recording and play it back.
 */
describe('the level meters', () => {
  it('shows one per channel, named the same as the picker offers', async () => {
    show()

    await waitFor(() => expect(meters()).toHaveLength(2))
    expect(meters().map((meter) => meter.textContent)).toEqual(['Left', 'Right'])
  })

  it('moves only the channel that sound is arriving on', async () => {
    show()
    await metersListening()

    act(() => fake.hear([1, 0]))

    expect(fillOf(meters()[0] as HTMLElement).style.transform).toBe('scaleX(1)')
    expect(fillOf(meters()[1] as HTMLElement).style.transform).toBe('scaleX(0)')
  })

  it('reads a quiet signal well up the meter, not as a sliver', async () => {
    show()
    await metersListening()

    act(() => fake.hear([10 ** (-30 / 20), 0]))

    const scale = Number(
      /scaleX\(([\d.]+)\)/.exec(fillOf(meters()[0] as HTMLElement).style.transform)?.[1]
    )
    expect(scale).toBeCloseTo(0.5, 4)
  })

  it('dims the channel that will not be recorded', async () => {
    useConfig.setState({ config: config({ inputChannel: 1 }) })
    show()
    await waitFor(() => expect(meters()).toHaveLength(2))

    expect(meters()[0]?.dataset['recorded']).toBe('true')
    expect(meters()[1]?.dataset['recorded']).toBe('false')
  })

  it('lights a lamp when the signal is too loud to record cleanly', async () => {
    show()
    await metersListening()

    act(() => fake.hear([0.9, 0]))
    expect(meters()[0]?.querySelector('.meter__clip')?.getAttribute('data-lit')).toBe('false')

    act(() => fake.hear([1, 0]))
    expect(meters()[0]?.querySelector('.meter__clip')?.getAttribute('data-lit')).toBe('true')
  })

  it('lets go of the device when the dialog closes', async () => {
    const view = show()
    await waitFor(() => expect(meters()).toHaveLength(2))

    view.unmount()

    expect(fake.stopped).toBeGreaterThan(0)
  })

  it('reopens the device when a different one is chosen', async () => {
    const user = userEvent.setup()
    show()
    await waitFor(() => expect(meters()).toHaveLength(2))

    await user.selectOptions(screen.getByRole('combobox', { name: 'Device' }), 'rubix')

    await waitFor(() => expect(fake.opened).toContain('rubix'))
    expect(fake.stopped).toBeGreaterThan(0)
  })
})
