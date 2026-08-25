import { create } from 'zustand'

import { noteFromFrequency, type NoteReading } from '@core/music/note'
import { addReading, steadyHz } from '@core/music/steady'
import { tuner } from '@renderer/audio/tuner'
import { useConfig } from '@renderer/state/config'

/**
 * How long a note stays on screen after it stops being heard.
 *
 * A plucked string dies away, and blanking the display the moment it does
 * leaves nothing to read at exactly the moment somebody looks up from the
 * peg they were turning.
 */
const HOLD_MS = 1200

interface TunerState {
  /** 'off' until the tool is open; 'deaf' when the input would not open. */
  status: 'off' | 'listening' | 'deaf'
  note: NoteReading | null
  frequency: number | null
  /** True while the note shown is a memory rather than something being heard. */
  fading: boolean
  level: number
}

export const useTuner = create<TunerState>(() => ({
  status: 'off',
  note: null,
  frequency: null,
  fading: false,
  level: 0
}))

/**
 * Listens for as long as the tuner is on screen.
 *
 * Opening the tool is the whole of the intent — nobody opens a tuner without
 * wanting it to listen — so there is no second button to press, and closing it
 * lets the microphone go.
 */
export async function startListening(): Promise<void> {
  const config = useConfig.getState().config
  recent = []
  heardAt = 0
  try {
    await tuner.start(config?.inputDeviceId ?? '', config?.inputChannel ?? 0)
    useTuner.setState({ status: 'listening' })
  } catch {
    useTuner.setState({ status: 'deaf', note: null, frequency: null })
  }
}

export function stopListening(): void {
  tuner.stop()
  useTuner.setState({ status: 'off', note: null, frequency: null, fading: false, level: 0 })
}

let recent: number[] = []
let heardAt = 0

export function followTuner(): () => void {
  return tuner.listen(({ frequency, level }) => {
    const now = Date.now()

    if (frequency !== null) {
      recent = addReading(recent, frequency)
      heardAt = now
      const steady = steadyHz(recent)
      useTuner.setState({
        note: steady === null ? null : noteFromFrequency(steady),
        frequency: steady,
        fading: false,
        level
      })
      return
    }

    const gone = now - heardAt > HOLD_MS
    if (gone) recent = []
    useTuner.setState({
      level,
      fading: !gone && heardAt !== 0,
      ...(gone ? { note: null, frequency: null } : {})
    })
  })
}
