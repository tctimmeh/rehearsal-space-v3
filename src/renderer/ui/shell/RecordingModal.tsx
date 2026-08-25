import { useCallback, useEffect, useState } from 'react'

import { ALL_INPUTS, channelName, inputOptions } from '@core/audio/inputChannels'
import { useConfig } from '@renderer/state/config'
import { inputDevices } from '@renderer/audio/recorder'
import { Button, Modal } from '../primitives'
import { LevelMeter } from './LevelMeter'
import { useInputMonitor } from './useInputMonitor'

const SYSTEM_DEFAULT = ''

/**
 * Which input to record from, and what it is hearing right now.
 *
 * A browser will not say what the inputs are called until it has been allowed
 * to listen once, so before that they are numbered and there is a way to ask.
 */
export function RecordingModal({ onDismiss }: { onDismiss: () => void }) {
  const chosen = useConfig((state) => state.config?.inputDeviceId ?? SYSTEM_DEFAULT)
  const channel = useConfig((state) => state.config?.inputChannel ?? ALL_INPUTS)
  const setPreference = useConfig((state) => state.set)
  const [devices, setDevices] = useState<MediaDeviceInfo[] | null>(null)
  const [asking, setAsking] = useState(false)

  const input = useInputMonitor(chosen)

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

  const nameOf = (device: MediaDeviceInfo, index: number) =>
    device.label === '' ? `Device ${index + 1}` : device.label

  const channels = input.status === 'live' ? input.channels : null

  const explainDefault = () => {
    if (chosen !== SYSTEM_DEFAULT) {
      return input.status === 'unavailable' ? 'not available right now' : ''
    }
    if (input.status === 'opening') return 'finding out which one that is…'
    if (input.status === 'unavailable') return 'no input available'
    return input.name === ''
      ? 'follows the system setting'
      : `right now that is ${input.name}, and it follows the system setting`
  }

  const unnamed = (devices ?? []).some((device) => device.label === '')

  return (
    <Modal
      title="Recording"
      subtitle="The input used when you record"
      onDismiss={onDismiss}
      footer={
        <>
          <span className="modal__foot-aside">
            {unnamed ? (
              <Button disabled={asking} onClick={() => void askForNames()}>
                {asking ? 'Asking…' : 'Show device names'}
              </Button>
            ) : (
              <Button onClick={() => void look()}>Look again</Button>
            )}
          </span>
          <Button onClick={onDismiss}>Done</Button>
        </>
      }
    >
      <div className="setting-row">
        <span className="setting-label">Device</span>
        <select
          className="well input setting-select"
          aria-label="Device"
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
        <span className="setting-label">Channels</span>
        <select
          className="well input setting-select"
          aria-label="Channels"
          value={channel}
          disabled={channels === null || channels <= 1}
          onChange={(event) => void setPreference({ inputChannel: Number(event.target.value) })}
        >
          {(channels === null
            ? [{ value: ALL_INPUTS, label: 'Looking…' }]
            : inputOptions(channels)
          ).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {channels === 2 ? (
        <p className="setting-under">
          an interface with two sockets arrives as one stereo device: socket 1 is the left
          channel, socket 2 the right
        </p>
      ) : null}

      <div className="setting-row setting-row--tight">
        <span className="setting-label">Level</span>
        <div className="meters">
          {input.status === 'live' ? (
            Array.from({ length: input.channels }, (_, index) => (
              <LevelMeter
                key={index}
                monitor={input.monitor}
                channel={index}
                name={channelName(index, input.channels)}
                recorded={channel === ALL_INPUTS || channel === index + 1}
              />
            ))
          ) : (
            <p className="meters__none">
              {input.status === 'opening' ? 'opening the device…' : 'nothing to listen to'}
            </p>
          )}
        </div>
      </div>

      {input.status === 'live' ? (
        <p className="setting-under">play something — a channel with no bar has nothing plugged in</p>
      ) : null}
    </Modal>
  )
}
