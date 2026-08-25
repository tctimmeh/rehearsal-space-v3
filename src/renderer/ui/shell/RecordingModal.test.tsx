// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppConfig } from '@shared/config'
import { useConfig } from '@renderer/state/config'
import { installBridge } from '@renderer/testing/bridge'
import { RecordingModal } from './RecordingModal'

const probeInput = vi.fn()
const inputDevices = vi.fn()

vi.mock('@renderer/audio/recorder', () => ({
  probeInput: (deviceId: string) => probeInput(deviceId),
  inputDevices: () => inputDevices()
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
  toolPaths: {},
  ...patch
})

const device = (deviceId: string, label: string) => ({ deviceId, label, kind: 'audioinput' })

beforeEach(() => {
  installBridge()
  useConfig.setState({ config: config() })
  inputDevices.mockResolvedValue([device('rubix', 'Rubix22 Analog Stereo')])
  probeInput.mockResolvedValue({ channels: 2, name: 'Rubix22 Analog Stereo' })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/** The picker starts out saying "Looking…" while the device is opened. */
const settledChannelPicker = async () => {
  const picker = screen.getByRole('combobox', { name: 'Channels' }) as HTMLSelectElement
  await waitFor(() => expect(picker.disabled).toBe(false))
  return picker
}

const show = () => render(<RecordingModal onDismiss={() => undefined} />)

/**
 * Nothing reports how many sockets a device has. A laptop's built-in
 * microphone array and a two-input interface both arrive as two channels of
 * different sound, so the picker describes the stream it can see rather than
 * hardware it would have to guess at.
 */
describe('choosing what to record', () => {
  it('offers nothing to choose when the capture is mono', async () => {
    probeInput.mockResolvedValue({ channels: 1, name: 'Built-in Microphone' })
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

    const picker = await settledChannelPicker()
    expect(picker.value).toBe('0')
  })

  it('passes the chosen side on to be saved', async () => {
    const user = userEvent.setup()
    show()

    const picker = await settledChannelPicker()
    await user.selectOptions(picker, 'Right only')

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
    probeInput.mockRejectedValue(new Error('NotFoundError'))
    show()

    await screen.findByText('not available right now')
  })
})
