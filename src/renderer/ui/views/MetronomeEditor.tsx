import { solveMetronome } from '@core/metronome/solve'
import { formatClock } from '@core/time'
import {
  METRONOME_SAMPLE_LABEL,
  type MetronomeChannel,
  type MetronomeSample
} from '@core/song/song'
import { Button, Readout } from '../primitives'

interface MetronomeEditorProps {
  channel: MetronomeChannel
  onChange: (patch: Partial<MetronomeChannel>) => void
}

const SAMPLES: MetronomeSample[] = ['tick', 'chirp', 'cymbal', 'rim', 'kit']

/**
 * A metronome channel is anchored at its end — where the music picks the beat
 * back up — so that is what is set, and the start follows from it.
 */
export function MetronomeEditor({ channel, onChange }: MetronomeEditorProps) {
  const timing = solveMetronome(channel)
  const { duration } = channel

  const setMode = (mode: 'measures' | 'startTime') => {
    if (mode === duration.mode) return
    onChange({
      duration:
        mode === 'measures'
          ? { mode: 'measures', bpm: Math.round(timing.bpm), measures: 1 }
          : { mode: 'startTime', approxBpm: Math.round(timing.bpm), startTime: timing.startTime }
    })
  }

  return (
    <>
      <div className="field">
        <label>Click</label>
        <div className="setting-row">
          {SAMPLES.map((sample) => (
            <Button
              key={sample}
              className="model-choice"
              onClick={() => onChange({ sample })}
              {...(channel.sample === sample ? { 'data-engaged': true } : {})}
            >
              {METRONOME_SAMPLE_LABEL[sample]}
            </Button>
          ))}
        </div>
      </div>

      <div className="field field--spaced">
        <label htmlFor="click-end">Ends at</label>
        <div className="setting-row">
          <Seconds
            id="click-end"
            value={channel.endTime}
            onChange={(endTime) => onChange({ endTime })}
          />
          <span className="setting-note">where the music takes the beat back</span>
        </div>
      </div>

      <div className="field field--spaced">
        <label>Length</label>
        <div className="setting-row">
          <Button
            className="model-choice"
            onClick={() => setMode('measures')}
            {...(duration.mode === 'measures' ? { 'data-engaged': true } : {})}
          >
            By measures
          </Button>
          <Button
            className="model-choice"
            onClick={() => setMode('startTime')}
            {...(duration.mode === 'startTime' ? { 'data-engaged': true } : {})}
          >
            By start time
          </Button>
        </div>
      </div>

      {duration.mode === 'measures' ? (
        <div className="setting-row field--spaced">
          <NumberField
            label="Tempo"
            suffix="bpm"
            value={duration.bpm}
            onChange={(bpm) => onChange({ duration: { ...duration, bpm } })}
          />
          <NumberField
            label="Measures"
            value={duration.measures}
            min={1}
            onChange={(measures) => onChange({ duration: { ...duration, measures } })}
          />
        </div>
      ) : (
        <div className="setting-row field--spaced">
          <div className="field">
            <label htmlFor="click-start">Starts at</label>
            <Seconds
              id="click-start"
              value={duration.startTime}
              onChange={(startTime) => onChange({ duration: { ...duration, startTime } })}
            />
          </div>
          <NumberField
            label="About"
            suffix="bpm"
            value={duration.approxBpm}
            onChange={(approxBpm) => onChange({ duration: { ...duration, approxBpm } })}
          />
        </div>
      )}

      <div className="setting-row field--spaced">
        <NumberField
          label="Beats per measure"
          value={channel.beatsPerMeasure}
          min={1}
          onChange={(beatsPerMeasure) => onChange({ beatsPerMeasure })}
        />
        <button
          type="button"
          className="check"
          data-engaged={channel.accentFirstBeat}
          onClick={() => onChange({ accentFirstBeat: !channel.accentFirstBeat })}
        >
          <span className="check__box" />
          Accent the downbeat
        </button>
      </div>

      <div className="click-summary">
        <Readout>{`${timing.beatCount} beats`}</Readout>
        <Readout>{`${timing.bpm.toFixed(1)} bpm`}</Readout>
        <Readout>{`${formatClock(timing.startTime)} → ${formatClock(timing.endTime)}`}</Readout>
        {duration.mode === 'startTime' && Math.abs(timing.bpm - duration.approxBpm) > 0.05 ? (
          <span className="setting-note">
            nudged from {duration.approxBpm} so the clicks land on both ends
          </span>
        ) : null}
      </div>
    </>
  )
}

function Seconds({
  id,
  value,
  onChange
}: {
  id: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <input
      id={id}
      className="well input input--number num"
      type="number"
      step="0.01"
      value={Number(value.toFixed(3))}
      onChange={(event) => {
        const next = Number(event.target.value)
        if (Number.isFinite(next)) onChange(next)
      }}
    />
  )
}

function NumberField({
  label,
  value,
  onChange,
  min = 1,
  suffix
}: {
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  suffix?: string
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="setting-row">
        <input
          className="well input input--number num"
          type="number"
          min={min}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next)) onChange(Math.max(min, next))
          }}
        />
        {suffix === undefined ? null : <span className="setting-note">{suffix}</span>}
      </div>
    </div>
  )
}
