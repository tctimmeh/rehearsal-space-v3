import { useCallback, useEffect, useState } from 'react'

import { ALL_INPUTS, inputOptions } from '@core/audio/inputChannels'
import { useConfig } from '@renderer/state/config'
import { countInputs, inputDevices } from '@renderer/audio/recorder'
import { Button } from '../primitives'

/**
 * Which input to record from.
 *
 * A browser will not say what the inputs are called until it has been allowed
 * to listen once, so before that they are numbered and there is a way to ask.
 */
export function InputDevices() {
  const chosen = useConfig((state) => state.config?.inputDeviceId ?? '')
  const channel = useConfig((state) => state.config?.inputChannel ?? ALL_INPUTS)
  const setPreference = useConfig((state) => state.set)
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  const [sockets, setSockets] = useState<number | null>(null)
  const [asking, setAsking] = useState(false)

  const look = useCallback(async () => {
    try {
      setDevices(await inputDevices())
    } catch {
      setDevices([])
    }
  }, [])

  useEffect(() => {
    void look()
  }, [look])

  /* How many sockets a device has can only be learned by opening it. */
  useEffect(() => {
    let current = true
    setSockets(null)
    void countInputs(chosen)
      .then((count) => {
        if (current) setSockets(count)
      })
      .catch(() => {
        if (current) setSockets(null)
      })
    return () => {
      current = false
    }
  }, [chosen])

  const askForNames = async () => {
    setAsking(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) track.stop()
      await look()
    } catch {
      /* Refused; the numbered names stay. */
    } finally {
      setAsking(false)
    }
  }

  const unnamed = (devices ?? []).some((device) => device.label === '')

  return (
    <>
      <div className="section-head">
        <h4>Recording</h4>
        {unnamed ? (
          <Button disabled={asking} onClick={() => void askForNames()}>
            {asking ? 'Asking…' : 'Show device names'}
          </Button>
        ) : (
          <Button onClick={() => void look()}>Look again</Button>
        )}
      </div>

      <div className="setting-row">
        <span className="setting-label">Device</span>
        <select
          className="well input setting-select"
          value={chosen}
          onChange={(event) =>
            void setPreference({ inputDeviceId: event.target.value, inputChannel: ALL_INPUTS })
          }
        >
          <option value="">Whatever the system offers</option>
          {(devices ?? []).map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label === `` ? `Device ${index + 1}` : device.label}
            </option>
          ))}
        </select>
      </div>

      <div className="setting-row setting-row--tight">
        <span className="setting-label">Socket</span>
        <select
          className="well input setting-select"
          value={channel}
          disabled={sockets === null || sockets <= 1}
          onChange={(event) => void setPreference({ inputChannel: Number(event.target.value) })}
        >
          {(sockets === null ? [{ value: ALL_INPUTS, label: 'Looking…' }] : inputOptions(sockets)).map(
            (option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            )
          )}
        </select>
        <span className="setting-note">
          {sockets !== null && sockets > 1
            ? 'an interface with two sockets is one stereo device'
            : ''}
        </span>
      </div>
    </>
  )
}
