import { create } from 'zustand'

import { noteFromFrequency, type NoteReading } from '@core/music/note'
import { DEFAULT_NEEDLE, moveNeedle, newNeedle } from '@core/music/steady'
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
  /**
   * How long the last string took to name, in milliseconds, counted from the
   * first sound of it. Temporary, for judging the needle's settings by
   * something better than an impression.
   */
  pickedUpIn: number | null
}

export const useTuner = create<TunerState>(() => ({
  status: 'off',
  note: null,
  frequency: null,
  fading: false,
  level: 0,
  pickedUpIn: null
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
  heardAt = 0
  soundAt = 0
  needle = newNeedle()
  try {
    await tuner.start(config?.inputDeviceId ?? '', config?.inputChannel ?? 0)
    useTuner.setState({ status: 'listening' })
  } catch {
    useTuner.setState({ status: 'deaf', note: null, frequency: null })
  }
}

export function stopListening(): void {
  tuner.stop()
  useTuner.setState({
    status: 'off',
    note: null,
    frequency: null,
    fading: false,
    level: 0,
    pickedUpIn: null
  })
}

let heardAt = 0
/** When the sound the tuner is working on was first heard at all. */
let soundAt = 0
/** What the needle is showing, and what it is thinking of showing instead. */
let needle = newNeedle()

export function followTuner(): () => void {
  return tuner.listen(({ frequency, clarity, level }) => {
    const now = Date.now()

    if (frequency !== null) {
      const blank = needle.hz === null
      if (blank && soundAt === 0) soundAt = now
      heardAt = now
      needle = moveNeedle(
        needle,
        { frequency, clarity, level },
        useConfig.getState().config?.tuner ?? DEFAULT_NEEDLE
      )
      useTuner.setState({
        note: needle.hz === null ? null : noteFromFrequency(needle.hz),
        frequency: needle.hz,
        fading: false,
        level,
        ...(blank && needle.hz !== null ? { pickedUpIn: now - soundAt } : {})
      })
      return
    }

    const gone = now - heardAt > HOLD_MS
    /* A note that has died away is not where the next one starts from. */
    if (gone) {
      needle = newNeedle()
      soundAt = 0
    }
    useTuner.setState({
      level,
      fading: !gone && heardAt !== 0,
      ...(gone ? { note: null, frequency: null } : {})
    })
  })
}
