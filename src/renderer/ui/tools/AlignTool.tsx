import { useMemo, useRef, useState } from 'react'

import { beatsBetween, solveMetronome } from '@core/metronome/solve'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { clampViewCentre } from '@core/song/viewWindow'
import {
  METRONOME_SAMPLE_LABEL,
  type AudioChannel,
  type MetronomeChannel,
  type MetronomeSample
} from '@core/song/song'
import { formatClock, formatClockPrecise } from '@core/time'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { Button } from '../primitives'
import { Waveform } from './Waveform'
import { usePeaks } from './usePeaks'

const WAVE_HEIGHT = 190
const ZOOM_STEPS = [0.25, 0.5, 1, 2, 4, 8, 20, 60, 180]
const DEFAULT_ZOOM = 4
const SAMPLES: MetronomeSample[] = ['tick', 'chirp', 'cymbal', 'rim', 'kit']

/**
 * Lining a click track up against the music.
 *
 * The numbers this sets are the ones nobody can type: where a count-in ends is
 * wherever the band actually comes in, which you find by looking at the
 * transient and dragging to it.
 */
export function AlignTool() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)
  const addMetronome = useSong((state) => state.addMetronome)
  const position = useTransport((state) => state.position)
  const seek = useTransport((state) => state.seek)
  const songStart = useTransport((state) => state.start)
  const songEnd = useTransport((state) => state.end)

  const audio = (song?.channels.filter((c) => c.kind === 'audio') ?? []) as AudioChannel[]
  const clicks = (song?.channels.filter((c) => c.kind === 'metronome') ?? []) as MetronomeChannel[]

  const [againstId, setAgainstId] = useState<string | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const [spanIndex, setSpanIndex] = useState(DEFAULT_ZOOM)
  const [centre, setCentre] = useState<number | null>(null)
  const panSpeed = useConfig((state) => state.config?.panSpeed ?? 0.15)
  const zoomSpeed = useConfig((state) => state.config?.zoomSpeed ?? 0.35)
  /* Wheel notches are counted up rather than acted on one by one, so a slow
     zoom is slow rather than dead, and a trackpad's many small deltas add up
     to the same movement as one notch of a wheel. */
  const zoomCarry = useRef(0)

  const against = audio.find((c) => c.id === againstId) ?? audio[0] ?? null
  const click = clicks.find((c) => c.id === clickId) ?? clicks[0] ?? null
  const peaks = usePeaks(song?.id, against?.id)

  const timing = useMemo(() => (click === null ? null : solveMetronome(click)), [click])
  const span = ZOOM_STEPS[spanIndex] ?? 4
  /* Follow the click being aligned until the user pans somewhere else, and
     never past the song — there is nothing out there to look at. Clamped on
     the way out as well as in, so zooming out cannot strand the view. */
  const middle = clampViewCentre(centre ?? timing?.endTime ?? 0, span, [songStart, songEnd])
  const from = middle - span / 2
  const to = middle + span / 2

  /* Whole seconds are useless once the window is short. */
  const clock = span < 2 ? formatClockPrecise : formatClock

  const strip = useRef<HTMLDivElement>(null)
  const timeAt = (clientX: number): number => {
    const box = strip.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return from
    return from + ((clientX - box.left) / box.width) * (to - from)
  }
  const xOf = (time: number): string => `${((time - from) / (to - from)) * 100}%`

  if (song === null) return <p className="tool-placeholder">No song loaded.</p>
  if (audio.length === 0) {
    return <p className="tool-placeholder">Import some audio to line a click track up against.</p>
  }

  const change = (patch: Partial<MetronomeChannel>) => {
    if (click === null) return
    update({
      channels: song.channels.map((c) => (c.id === click.id ? { ...click, ...patch } : c))
    })
  }

  /* Both ends are just times, so dragging either is the same thing. How many
     beats fall between them follows from the tempo. */
  const dragStart = (clientX: number) => change({ startTime: timeAt(clientX) })
  const dragEnd = (clientX: number) => change({ endTime: timeAt(clientX) })

  const beats = timing === null ? [] : beatsBetween(timing, from, to)

  return (
    <div className="align">
      <div className="align__controls">
        <Picker
          label="Against"
          value={against?.id ?? ''}
          options={audio.map((c) => ({ id: c.id, label: c.name }))}
          onChange={setAgainstId}
        />
        <Picker
          label="Click track"
          value={click?.id ?? ''}
          options={clicks.map((c) => ({ id: c.id, label: c.name }))}
          onChange={setClickId}
          empty="None yet"
        />
        <Button onClick={addMetronome}>New</Button>
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
                {SAMPLES.map((sample) => (
                  <option key={sample} value={sample}>
                    {METRONOME_SAMPLE_LABEL[sample]}
                  </option>
                ))}
              </select>
            </label>
            <Field label="BPM">
              <input
                className="well input input--tiny num"
                type="number"
                min={20}
                value={Math.round(click.bpm)}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next > 0) change({ bpm: next })
                }}
              />
            </Field>
            <Field label="Beats">
              <input
                className="well input input--tiny num"
                type="number"
                min={1}
                value={click.beatsPerMeasure}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next)) change({ beatsPerMeasure: Math.max(1, next) })
                }}
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
        <span className="align__spacer" />
        <Button disabled={spanIndex === 0} onClick={() => setSpanIndex((i) => i - 1)}>
          Closer
        </Button>
        <Button
          disabled={spanIndex === ZOOM_STEPS.length - 1}
          onClick={() => setSpanIndex((i) => i + 1)}
        >
          Wider
        </Button>
        <span className="setting-note num">{span < 1 ? `${span * 1000}ms` : `${span}s`}</span>
      </div>

      <div
        className="align__strip well"
        ref={strip}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.align__handle') !== null) return
          seek(timeAt(event.clientX))
        }}
        onWheel={(event) => {
          /* Shift pans, because at a quarter-second across the window the
             thing you are looking for is usually just off the edge. */
          const notches = event.deltaY / 100

          if (event.shiftKey) {
            setCentre(
              clampViewCentre(middle + notches * span * panSpeed, span, [songStart, songEnd])
            )
            return
          }

          zoomCarry.current += notches * zoomSpeed
          const steps = Math.trunc(zoomCarry.current)
          if (steps === 0) return
          zoomCarry.current -= steps
          /* Hold the instant under the pointer still. The zoom steps are not
             in a constant ratio, so the ratio has to be taken from the steps
             themselves — guessing at it makes the view creep away from the
             transient being aimed at, a little more with every notch. */
          const at = timeAt(event.clientX)
          const next = Math.min(ZOOM_STEPS.length - 1, Math.max(0, spanIndex + steps))
          const nextSpan = ZOOM_STEPS[next] ?? span
          setCentre(
            clampViewCentre(at + (middle - at) * (nextSpan / span), nextSpan, [songStart, songEnd])
          )
          setSpanIndex(next)
        }}
      >
        <Waveform
          peaks={peaks}
          from={from}
          to={to}
          offset={against?.startTime ?? 0}
          color={CHANNEL_SUBJECT_COLOR[against?.subject ?? 'other']}
          height={WAVE_HEIGHT}
        />

        {beats.map((beat) => (
          <span
            key={beat.index}
            className="align__beat"
            data-accent={beat.accent}
            style={{ left: xOf(beat.time) }}
          />
        ))}

        {timing === null ? null : (
          <>
            {/* A handle beyond the edge is not drawn at a nonsense position; the
                edge says which way it lies so it can be panned back to. */}
            {inView(timing.startTime, from, to) ? (
              <Handle
                className="align__handle align__handle--start"
                label={`Start ${clock(timing.startTime)}`}
                time={timing.startTime}
                left={xOf(timing.startTime)}
                onDrag={dragStart}
                onNudge={(startTime) => change({ startTime })}
              />
            ) : (
              <Offscreen side={timing.startTime < from ? 'left' : 'right'} kind="start" />
            )}
            {inView(timing.endTime, from, to) ? (
              <Handle
                className="align__handle align__handle--end"
                label={`End ${clock(timing.endTime)}`}
                time={timing.endTime}
                left={xOf(timing.endTime)}
                onDrag={dragEnd}
                onNudge={(endTime) => change({ endTime })}
              />
            ) : (
              <Offscreen side={timing.endTime < from ? 'left' : 'right'} kind="end" />
            )}
          </>
        )}

        <span className="align__playhead" style={{ left: xOf(position) }} />
      </div>

      <div className="align__scale">
        <span className="num">{clock(from)}</span>
        <span className="setting-note">
          {timing === null
            ? 'Add a metronome channel in Setup to line one up.'
            : `${timing.beatCount} beats · ${timing.bpm.toFixed(1)} bpm · drag the handles, or arrow keys to nudge · scroll to zoom, shift to pan`}
        </span>
        <span className="num">{clock(to)}</span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="align__picker">
      <span>{label}</span>
      {children}
    </label>
  )
}

const inView = (time: number, from: number, to: number): boolean => time >= from && time <= to

/** Says which way an off-screen handle lies, and takes you to it. */
function Offscreen({ side, kind }: { side: 'left' | 'right'; kind: 'start' | 'end' }) {
  return (
    <span className={`align__offscreen align__offscreen--${side} align__offscreen--${kind}`}>
      {side === 'left' ? '‹' : '›'} {kind}
    </span>
  )
}

/** Arrow keys move by this much, and a tenth of it with shift held. */
const NUDGE_S = 0.01

function Handle({
  className,
  label,
  time,
  left,
  onDrag,
  onNudge
}: {
  className: string
  label: string
  time: number
  left: string
  onDrag: (clientX: number) => void
  onNudge: (time: number) => void
}) {
  return (
    <span
      className={className}
      style={{ left }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuenow={time}
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onDrag(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onDrag(event.clientX)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        /* Dragging with the pointer should not leave the handle holding focus:
           the next key pressed for anything else would light it up. */
        event.currentTarget.blur()
      }}
      onKeyDown={(event) => {
        const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (direction === 0) return
        event.preventDefault()
        onNudge(time + direction * NUDGE_S * (event.shiftKey ? 0.1 : 1))
      }}
    >
      <span className="align__flag">{label}</span>
    </span>
  )
}

function Picker({
  label,
  value,
  options,
  onChange,
  empty
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
  empty?: string
}) {
  return (
    <label className="align__picker">
      <span>{label}</span>
      <select
        className="well input"
        value={value}
        disabled={options.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option>{empty ?? 'None'}</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
