import { useState } from 'react'

import { Readout } from '../primitives'

const BPM_MIN = 20
const BPM_MAX = 300

/** M0 shell only — no click is scheduled until M9. */
export function MetronomeGadget() {
  const [bpm, setBpm] = useState(104)
  const [running, setRunning] = useState(false)

  const nudge = (delta: number) => setBpm((current) => Math.min(BPM_MAX, Math.max(BPM_MIN, current + delta)))

  return (
    <>
      <Readout size="lg">{bpm}</Readout>
      <div className="gadget__stack">
        <button type="button" className="raised gadget__btn" aria-label="Faster" onClick={() => nudge(1)}>
          +
        </button>
        <button type="button" className="raised gadget__btn" aria-label="Slower" onClick={() => nudge(-1)}>
          −
        </button>
      </div>
      <button
        type="button"
        className={`raised gadget__btn ${running ? '' : 'gadget__btn--go'}`}
        onClick={() => setRunning((wasRunning) => !wasRunning)}
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </>
  )
}
