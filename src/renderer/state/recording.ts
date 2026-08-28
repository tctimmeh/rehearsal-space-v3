import { create } from 'zustand'

import { stepRecording, timelineIsOpen, type RecordPhase } from '@core/record/arming'
import { audioEngine } from '@renderer/audio/engine'
import { useSong } from '@renderer/state/song'
import { onTransportEvent, useTransport, type TransportEvent } from '@renderer/state/transport'

interface RecordingState {
  phase: RecordPhase
  /** Arms, disarms, or punches out of a take that is running. */
  toggle: () => void
  /** Stops the player and throws the take away rather than keeping it. */
  discard: () => void
}

/**
 * The record button, which arms rather than records.
 *
 * What is actually captured is decided by the transport: a take runs for
 * exactly as long as the player does, so anything laid over a song lines up
 * with it instead of beginning wherever the two buttons were pressed.
 */
export const useRecording = create<RecordingState>((set, get) => ({
  phase: 'off',

  toggle: () => {
    void apply(get().phase, 'toggle', set)
  },

  /*
   * The order is the whole of it. Disarming first means the stop that follows
   * finds nothing to finish, so the take is dropped rather than saved — going
   * the other way round would write the very take being thrown away.
   */
  discard: () => {
    if (get().phase !== 'recording') return
    useSong.getState().discardTake()
    set({ phase: 'off' })
    audioEngine.setOpenEnded(false)
    useSong.getState().disarmRecording()
    useTransport.getState().stop()
    useSong.getState().refreshBounds()
  }
}))

type Setter = (partial: Partial<RecordingState>) => void

async function apply(
  phase: RecordPhase,
  event: TransportEvent | 'toggle',
  set: Setter
): Promise<void> {
  const song = useSong.getState()
  const step = stepRecording(phase, event, useTransport.getState().playing)
  if (step.phase === phase && step.take === null) return

  if (step.take === 'begin') song.beginTake()
  set({ phase: step.phase })
  audioEngine.setOpenEnded(timelineIsOpen(step.phase))

  if (step.take === 'finish') {
    await song.finishTake()
    /* The song is as long as its channels again, not as long as the take. */
    if (!timelineIsOpen(step.phase)) useSong.getState().refreshBounds()
  }

  /* Holding the device open is what makes a take start the instant the player
     does, so it is opened on arming and let go of when there is nothing to
     record into. */
  if (phase === 'off' && step.phase !== 'off') {
    try {
      await song.armRecording()
    } catch {
      set({ phase: 'off' })
      audioEngine.setOpenEnded(false)
    }
  } else if (step.phase === 'off') {
    song.disarmRecording()
  }
}

/** Wires the record button to the transport. Lives as long as the app does. */
export function followTransportForRecording(): () => void {
  return onTransportEvent((event) => {
    void apply(useRecording.getState().phase, event, (partial) =>
      useRecording.setState(partial)
    )
  })
}
