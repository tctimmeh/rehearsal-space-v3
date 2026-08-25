import { useCallback, useEffect, useState } from 'react'

import { ALL_INPUTS, inputOptions } from '@core/audio/inputChannels'
import { useConfig } from '@renderer/state/config'
import { inputDevices, probeInput, type InputReport } from '@renderer/audio/recorder'
import { Button } from '../primitives'

const SYSTEM_DEFAULT = ''

/**
 * Which input to record from.
 *
 * A browser will not say what the inputs are called until it has been allowed
 * to listen once, so before that they are numbered and there is a way to ask.
 */
export function InputDevices() {
  const chosen = useConfig((state) => state.config?.inputDeviceId ?? SYSTEM_DEFAULT)
  const channel = useConfig((state) => state.config?.inputChannel ?? ALL_INPUTS)
  const setPreference = useConfig((state) => state.set)
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  const [report, setReport] = useState<InputReport | 'looking' | 'unavailable'>('looking')

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

  /* What a device offers, and which one "system default" means, are both only
     knowable by opening it. */
  useEffect(() => {
    let current = true
    setReport('looking')
    void probeInput(chosen)
      .then((found) => {
        if (current) setReport(found)
      })
      .catch(() => {
        if (current) setReport('unavailable')
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

  const nameOf = (device: MediaDeviceInfo, index: number) =>
    device.label === '' ? `Device ${index + 1}` : device.label

  const sockets = typeof report === 'object' ? report.sockets : null
  const resolved = typeof report === 'object' ? report.name : ''

  const explainDefault = () => {
    if (chosen !== SYSTEM_DEFAULT) return report === 'unavailable' ? 'not available right now' : ''
    if (report === 'looking') return 'finding out which one that is…'
    if (report === 'unavailable') return 'no input available'
    return resolved === ''
      ? 'follows the system setting'
      : `right now that is ${resolved}, and it follows the system setting`
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
          <option value={SYSTEM_DEFAULT}>System default</option>
          {(devices ?? []).map((device, index) => (
            <option key={device.deviceId} value={device.deviceId}>
              {nameOf(device, index)}
            </option>
          ))}
        </select>
      </div>

      {explainDefault() === '' ? null : <p className="setting-under">{explainDefault()}</p>}

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
