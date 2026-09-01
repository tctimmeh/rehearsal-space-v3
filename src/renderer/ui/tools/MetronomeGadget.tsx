import { useEffect, useRef, useState } from 'react'

import { beatOfMeasure, BEATS_MAX, BEATS_MIN, BPM_MAX, BPM_MIN } from '@core/metronome/pulse'
import { METRONOME_SAMPLE_LABEL, METRONOME_SAMPLES } from '@core/song/song'
import { audioEngine } from '@renderer/audio/engine'
import { useConfig } from '@renderer/state/config'
import { useMetronome } from '@renderer/state/metronome'
import { escapeAnswered, NumberField, Readout, RepeatButton } from '../primitives'

export function MetronomeGadget() {
  const settings = useConfig((state) => state.config?.metronome)
  const running = useMetronome((state) => state.running)
  const beat = useMetronome((state) => state.beat)
  const toggle = useMetronome((state) => state.toggle)
  const change = useMetronome((state) => state.change)
  const tap = useMetronome((state) => state.tap)
  const tapping = useMetronome((state) => state.tapping)

  /* Fetch the sounds now rather than when start is pressed: on a cold app that
     wait is a second of a metronome that says it is running and is not. */
  useEffect(() => {
    void audioEngine.clicksReady()
  }, [])

  if (settings === undefined) return null
  const { bpm, beatsPerMeasure, accentFirstBeat } = settings

  /* Read from the store rather than from this render: held buttons step
     faster than React commits, and a step computed from a stale tempo is a
     step that never happens. */
  const nudge = (delta: number) => {
    const current = useConfig.getState().config?.metronome.bpm ?? bpm
    change({ bpm: Math.min(BPM_MAX, Math.max(BPM_MIN, current + delta)) })
  }

  const lit = running ? beatOfMeasure(beat, beatsPerMeasure) : 0

  return (
    <>
      <div className="metro__tempo">
        <Readout size="lg" className="metro__bpm">
          {bpm}
        </Readout>
        <span className="metro__unit">bpm</span>
      </div>

      <div className="gadget__stack">
        <RepeatButton className="raised gadget__btn" aria-label="Faster" onPress={() => nudge(1)}>
          +
        </RepeatButton>
        <RepeatButton className="raised gadget__btn" aria-label="Slower" onPress={() => nudge(-1)}>
          −
        </RepeatButton>
      </div>

      <button
        type="button"
        className="raised gadget__btn metro__tap"
        onClick={tap}
        title="Tap in time to set the tempo"
      >
        {tapping > 0 ? `Tap ${tapping}` : 'Tap'}
      </button>

      <MetronomeSetup />

      <button
        type="button"
        className={`raised gadget__btn ${running ? '' : 'gadget__btn--go'}`}
        onClick={toggle}
        title="Tilde key, anywhere in the app"
      >
        {running ? 'Stop' : 'Start'}
      </button>

      {/* Last in the row: this is the one thing that changes width, and
          anything after it would move out from under the pointer that just
          changed it. */}
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
    </>
  )
}

/** The settings that are chosen once and then left alone. */
function MetronomeSetup() {
  const settings = useConfig((state) => state.config?.metronome)
  const change = useMetronome((state) => state.change)
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      escapeAnswered(event)
      setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (settings === undefined) return null
  const { beatsPerMeasure, accentFirstBeat, sample } = settings

  return (
    <div className="metro__setup" ref={wrap}>
      <button
        type="button"
        className="raised gadget__btn"
        aria-label="Metronome setup"
        aria-expanded={open}
        data-engaged={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        ⋯
      </button>

      {open ? (
        <div className="metro__panel">
          <div className="metro__field">
            <span className="metro__label">Beats</span>
            <NumberField
              label="Beats per measure"
              className="metro__number"
              value={beatsPerMeasure}
              min={BEATS_MIN}
              max={BEATS_MAX}
              onChange={(beatsPerMeasure) => change({ beatsPerMeasure })}
            />
          </div>

          <label className="metro__check">
            <input
              type="checkbox"
              checked={accentFirstBeat}
              onChange={(event) => change({ accentFirstBeat: event.target.checked })}
            />
            <span>Accent first beat</span>
          </label>

          <label className="metro__field">
            <span className="metro__label">Sound</span>
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
          </label>
        </div>
      ) : null}
    </div>
  )
}
