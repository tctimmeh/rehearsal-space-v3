import { useCallback, useEffect, useState } from 'react'

import { useConfig } from '@renderer/state/config'
import { inputDevices } from '@renderer/audio/recorder'
import { Button } from '../primitives'

/**
 * Which input to record from.
 *
 * A browser will not say what the inputs are called until it has been allowed
 * to listen once, so before that they are numbered and there is a way to ask.
 */
export function InputDevices() {
  const chosen = useConfig((state) => state.config?.inputDeviceId ?? '')
  const setPreference = useConfig((state) => state.set)
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
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
        <span className="setting-label">Input</span>
        <select
          className="well input setting-select"
          value={chosen}
          onChange={(event) => void setPreference({ inputDeviceId: event.target.value })}
        >
          <option value="">Whatever the system offers</option>
          {(devices ?? []).map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label === `` ? `Input ${index + 1}` : device.label}
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
