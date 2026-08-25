import { useEffect, useState } from 'react'

import { InputMonitor } from '@renderer/audio/inputMonitor'

export type MonitorState =
  | { status: 'opening' }
  | { status: 'unavailable' }
  | { status: 'live'; monitor: InputMonitor; name: string; channels: number }

/**
 * Holds the chosen input open for as long as it is being looked at.
 *
 * Opening the device is what answers every question about it — its name, how
 * many channels it has, and whether anything is arriving — so this replaces
 * asking separately and keeps the answer live.
 */
export function useInputMonitor(deviceId: string): MonitorState {
  const [state, setState] = useState<MonitorState>({ status: 'opening' })

  useEffect(() => {
    const monitor = new InputMonitor()
    let wanted = true
    setState({ status: 'opening' })

    void monitor
      .start(deviceId)
      .then(({ name, channels }) => {
        if (wanted) setState({ status: 'live', monitor, name, channels })
        else monitor.stop()
      })
      .catch(() => {
        if (wanted) setState({ status: 'unavailable' })
      })

    return () => {
      wanted = false
      monitor.stop()
    }
  }, [deviceId])

  return state
}
