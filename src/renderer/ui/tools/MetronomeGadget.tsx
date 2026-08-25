import { useEffect } from 'react'

import { beatOfMeasure, BEATS_MAX, BEATS_MIN } from '@core/metronome/pulse'
import { audioEngine } from '@renderer/audio/engine'
import { METRONOME_SAMPLE_LABEL, METRONOME_SAMPLES } from '@core/song/song'
import { useConfig } from '@renderer/state/config'
import { useMetronome } from '@renderer/state/metronome'
import { Readout } from '../primitives'

const BPM_MIN = 20
const BPM_MAX = 300
/** A nudge of one is for fine work; the coarse step is what taps a tempo in. */
const COARSE = 5

export function MetronomeGadget() {
  const settings = useConfig((state) => state.config?.metronome)
  const running = useMetronome((state) => state.running)
  const beat = useMetronome((state) => state.beat)
  const toggle = useMetronome((state) => state.toggle)
  const change = useMetronome((state) => state.change)

  /* Fetch the sounds now rather than when start is pressed: on a cold app that
     wait is a second of a metronome that says it is running and is not. */
  useEffect(() => {
    void audioEngine.clicksReady()
  }, [])

  if (settings === undefined) return null
  const { bpm, beatsPerMeasure, accentFirstBeat, sample } = settings

  const nudge = (delta: number) =>
    change({ bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, bpm + delta)) })

  const lit = running ? beatOfMeasure(beat, beatsPerMeasure) : 0

  return (
    <>
      <div className="metro__tempo">
        <Readout size="lg">{bpm}</Readout>
        <span className="metro__unit">bpm</span>
      </div>

      <div className="gadget__stack">
        <button
          type="button"
          className="raised gadget__btn"
          aria-label="Faster"
          onClick={() => nudge(1)}
          onContextMenu={(event) => {
            event.preventDefault()
            nudge(COARSE)
          }}
        >
          +
        </button>
        <button
          type="button"
          className="raised gadget__btn"
          aria-label="Slower"
          onClick={() => nudge(-1)}
          onContextMenu={(event) => {
            event.preventDefault()
            nudge(-COARSE)
          }}
        >
          −
        </button>
      </div>

      <div className="metro__beats" role="group" aria-label="Beat">
        {Array.from({ length: beatsPerMeasure }, (_, index) => (
          <span
            key={index}
            className="metro__beat"
            data-lit={lit === index + 1}
            data-accent={accentFirstBeat && index === 0}
          />
        ))}
      </div>

      <label className="metro__field">
        <span className="metro__label">Beats</span>
        <input
          className="well input metro__number"
          type="number"
          min={BEATS_MIN}
          max={BEATS_MAX}
          value={beatsPerMeasure}
          aria-label="Beats per measure"
          onChange={(event) => change({ beatsPerMeasure: Number(event.target.value) })}
        />
      </label>

      <label className="metro__check">
        <input
          type="checkbox"
          checked={accentFirstBeat}
          onChange={(event) => change({ accentFirstBeat: event.target.checked })}
        />
        <span>Accent 1</span>
      </label>

      <select
        className="well input metro__sample"
        aria-label="Sound"
        value={sample}
        onChange={(event) =>
          change({ sample: event.target.value as (typeof METRONOME_SAMPLES)[number] })
        }
      >
        {METRONOME_SAMPLES.map((name) => (
          <option key={name} value={name}>
            {METRONOME_SAMPLE_LABEL[name]}
          </option>
        ))}
      </select>

      <button
        type="button"
        className={`raised gadget__btn ${running ? '' : 'gadget__btn--go'}`}
        onClick={toggle}
        title="Tilde key, anywhere in the app"
      >
        {running ? 'Stop' : 'Start'}
      </button>
    </>
  )
}
