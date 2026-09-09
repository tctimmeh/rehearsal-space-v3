import { beatsBetween, type MetronomeTiming } from '@core/metronome/solve'
import {
  METRONOME_SAMPLES,
  METRONOME_SAMPLE_LABEL,
  type MetronomeChannel,
  type MetronomeSample
} from '@core/song/song'
import { NumberField } from '../primitives'
import { Field, Handle, Offscreen, Picker, inView, type View } from './waveformParts'

/**
 * Lining a click track up against the music.
 *
 * The numbers this sets are the ones nobody can type: where a count-in ends is
 * wherever the band actually comes in, which you find by looking at the
 * transient and dragging to it.
 *
 * Which click track is not asked here. This is opened from the one it is for,
 * so a picker offering the others would only be a way of quietly starting on a
 * different channel from the one being edited.
 */
export function ClickTrackControls({
  click,
  change
}: {
  click: MetronomeChannel | null
  change: (patch: Partial<MetronomeChannel>) => void
}) {
  return (
    <>
      {click === null ? null : (
        <>
          <span className="align__divider" />
          <label className="align__picker">
            <span>Sound</span>
            <select
              className="well input"
              value={click.sample}
              onChange={(event) => change({ sample: event.target.value as MetronomeSample })}
            >
              {METRONOME_SAMPLES.map((sample) => (
                <option key={sample} value={sample}>
                  {METRONOME_SAMPLE_LABEL[sample]}
                </option>
              ))}
            </select>
          </label>
          <Field label="BPM">
            <NumberField
              label="BPM"
              className="number-field--tiny"
              value={Math.round(click.bpm)}
              min={20}
              max={400}
              onChange={(bpm) => change({ bpm })}
            />
          </Field>
          <Field label="Beats">
            <NumberField
              label="Beats per measure"
              className="number-field--tiny"
              value={click.beatsPerMeasure}
              min={1}
              max={16}
              onChange={(beatsPerMeasure) => change({ beatsPerMeasure })}
            />
          </Field>
          <button
            type="button"
            className="check align__accent"
            data-engaged={click.accentFirstBeat}
            onClick={() => change({ accentFirstBeat: !click.accentFirstBeat })}
          >
            <span className="check__box" />
            Accent
          </button>
        </>
      )}
    </>
  )
}

export function ClickTrackMarks({
  timing,
  view,
  change
}: {
  timing: MetronomeTiming | null
  view: View
  change: (patch: Partial<MetronomeChannel>) => void
}) {
  if (timing === null) return null
  const beats = beatsBetween(timing, view.from, view.to)

  /* Both ends are just times, so dragging either is the same thing. How many
     beats fall between them follows from the tempo. */
  return (
    <>
      {beats.map((beat) => (
        <span
          key={beat.index}
          className="align__beat"
          data-accent={beat.accent}
          style={{ left: view.xOf(beat.time) }}
        />
      ))}

      {/* A handle beyond the edge is not drawn at a nonsense position; the edge
          says which way it lies so it can be panned back to. */}
      {inView(timing.startTime, view) ? (
        <Handle
          className="align__handle align__handle--start"
          label={`Start ${view.clock(timing.startTime)}`}
          time={timing.startTime}
          view={view}
          onDrag={(startTime) => change({ startTime })}
        />
      ) : (
        <Offscreen side={timing.startTime < view.from ? 'left' : 'right'} kind="start" />
      )}
      {inView(timing.endTime, view) ? (
        <Handle
          className="align__handle align__handle--end"
          label={`End ${view.clock(timing.endTime)}`}
          time={timing.endTime}
          view={view}
          onDrag={(endTime) => change({ endTime })}
        />
      ) : (
        <Offscreen side={timing.endTime < view.from ? 'left' : 'right'} kind="end" />
      )}
    </>
  )
}
