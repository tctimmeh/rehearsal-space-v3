import { useEffect } from 'react'

import { IN_TUNE_CENTS, isInTune } from '@core/music/note'
import { useConfig } from '@renderer/state/config'
import { startListening, stopListening, useTuner } from '@renderer/state/tuner'
import { Readout } from '../primitives'

/** The meter runs half a semitone either way; beyond that another note is nearer. */
const RANGE_CENTS = 50

export function TunerGadget() {
  const status = useTuner((state) => state.status)
  const note = useTuner((state) => state.note)
  const frequency = useTuner((state) => state.frequency)
  const fading = useTuner((state) => state.fading)

  const deviceId = useConfig((state) => state.config?.inputDeviceId ?? '')
  const channel = useConfig((state) => state.config?.inputChannel ?? 0)

  /* Opening the tool is the whole of the intent: nobody opens a tuner without
     wanting it to listen. Closing it lets the microphone go.

     Keyed on the input, because changing it while the tuner is open used to
     leave it holding the device that was chosen before — which is silent, so
     the tuner simply went dead until it was closed and opened again. */
  useEffect(() => {
    void startListening()
    return stopListening
  }, [deviceId, channel])

  const cents = note?.cents ?? 0
  const tuned = note !== null && !fading && isInTune(cents)
  const offset = Math.max(-RANGE_CENTS, Math.min(RANGE_CENTS, cents))

  return (
    <>
      <Readout size="lg" className="tuner__note" data-tuned={tuned}>
        {note === null ? '—' : `${note.name}${note.octave}`}
      </Readout>

      <div className="tuner__meter">
        <div className="well cents" data-fading={fading}>
          <span className="cents__center" />
          <span className="cents__band" />
          {note === null ? null : (
            <span
              className="cents__needle"
              data-tuned={tuned}
              style={{ left: `${50 + offset}%` }}
            />
          )}
        </div>
        <div className="cents__scale">
          <span>−50</span>
          <span className="cents__reading">
            {status === 'deaf'
              ? 'no input'
              : note === null
                ? 'listening…'
                : `${cents > 0 ? '+' : ''}${cents.toFixed(1)} cents`}
          </span>
          <span>+50</span>
        </div>
      </div>

      <Readout className="tuner__hz">
        {frequency === null ? '—' : `${frequency.toFixed(1)} Hz`}
      </Readout>

    </>
  )
}

export const TUNER_IN_TUNE_CENTS = IN_TUNE_CENTS
