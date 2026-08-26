import { useEffect, useMemo, useRef, useState } from 'react'

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
import { useAlign } from '@renderer/state/align'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { Waveform } from './Waveform'
import { NumberField } from '../primitives'
import { usePeaks } from './usePeaks'

const WAVE_HEIGHT = 190
const DEFAULT_SPAN = 4
/** Fifty milliseconds across the window is about as close as peaks can say. */
const MIN_SPAN = 0.05
/** Pressing a button is a deliberate step, so it is worth more than a notch. */
const BUTTON_FACTOR = 1.6
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
  const position = useTransport((state) => state.position)
  const seek = useTransport((state) => state.seek)
  const songStart = useTransport((state) => state.start)
  const songEnd = useTransport((state) => state.end)

  const audio = (song?.channels.filter((c) => c.kind === 'audio') ?? []) as AudioChannel[]
  const clicks = (song?.channels.filter((c) => c.kind === 'metronome') ?? []) as MetronomeChannel[]

  const [againstId, setAgainstId] = useState<string | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const pointedAt = useAlign((state) => state.clickId)

  /* Whatever the tool was opened for wins, until another one is chosen here. */
  useEffect(() => {
    if (pointedAt !== null) setClickId(pointedAt)
  }, [pointedAt])
  const [span, setSpan] = useState(DEFAULT_SPAN)
  const [centre, setCentre] = useState<number | null>(null)
  const panSpeed = useConfig((state) => state.config?.panSpeed ?? 0.1)
  const zoomSpeed = useConfig((state) => state.config?.zoomSpeed ?? 0.15)
  /* Where a middle-button drag took hold, and where the view was then. */
  const grab = useRef<{ x: number; centre: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  /* Held in a ref as well as in state: the first move of a drag arrives before
     a re-render would have told the handler that a drag had started. */
  const scrubbing = useRef(false)
  const [showScrub, setShowScrub] = useState(false)

  const against = audio.find((c) => c.id === againstId) ?? audio[0] ?? null
  const click = clicks.find((c) => c.id === clickId) ?? clicks[0] ?? null
  const peaks = usePeaks(song?.id, against?.id)

  const timing = useMemo(() => (click === null ? null : solveMetronome(click)), [click])
  /* Follow the click being aligned until the user pans somewhere else, and
     never past the song — there is nothing out there to look at. Clamped on
     the way out as well as in, so zooming out cannot strand the view. */
  /* No wider than the song plus a little air: there is nothing beyond it. */
  const maxSpan = Math.max(DEFAULT_SPAN, songEnd - songStart + 2)
  const visible = Math.min(maxSpan, Math.max(MIN_SPAN, span))
  const middle = clampViewCentre(centre ?? timing?.endTime ?? 0, visible, [songStart, songEnd])
  const from = middle - visible / 2
  const to = middle + visible / 2

  /* Whole seconds are useless once the window is short. */
  const clock = visible < 2 ? formatClockPrecise : formatClock

  /**
   * Zooming is continuous rather than stepped. A notch is worth a fraction of
   * a doubling, so every notch moves the view — a wheel that sometimes does
   * nothing feels broken, however sensible the reason.
   */
  const zoomBy = (factor: number, at: number) => {
    const next = Math.min(maxSpan, Math.max(MIN_SPAN, visible * factor))
    setCentre(clampViewCentre(at + (middle - at) * (next / visible), next, [songStart, songEnd]))
    setSpan(next)
  }

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
      </div>

      <div
        className="align__strip well"
        ref={strip}
        data-grabbing={grabbing}
        data-scrubbing={showScrub}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.align__handle') !== null) return

          /* Middle button drags the waveform along under the pointer. */
          if (event.button === 1) {
            event.preventDefault()
            /* Take hold first. Capture is a convenience — it keeps the drag
               alive past the edge of the strip — and must not be what decides
               whether the drag happens at all. */
            grab.current = { x: event.clientX, centre: middle }
            setGrabbing(true)
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* No capture; the drag still works within the strip. */
            }
            return
          }
          if (event.button !== 0) return

          /* Scrubbing: the playhead follows for as long as the button is
             down, so a spot can be hunted for by ear rather than found in
             one go. */
          scrubbing.current = true
          setShowScrub(true)
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            /* No capture; the scrub still works within the strip. */
          }
          seek(timeAt(event.clientX))
        }}
        onPointerMove={(event) => {
          if (scrubbing.current) {
            seek(timeAt(event.clientX))
            return
          }
          const held = grab.current
          const box = strip.current?.getBoundingClientRect()
          if (held === null || box === undefined || box.width === 0) return
          const moved = ((event.clientX - held.x) / box.width) * visible
          setCentre(clampViewCentre(held.centre - moved, visible, [songStart, songEnd]))
        }}
        onPointerUp={(event) => {
          scrubbing.current = false
          setShowScrub(false)
          if (grab.current === null) {
            try {
              event.currentTarget.releasePointerCapture(event.pointerId)
            } catch {
              /* Never captured. */
            }
            return
          }
          grab.current = null
          setGrabbing(false)
          try {
            event.currentTarget.releasePointerCapture(event.pointerId)
          } catch {
            /* Never captured. */
          }
        }}
        onPointerCancel={() => {
          scrubbing.current = false
          setShowScrub(false)
          grab.current = null
          setGrabbing(false)
        }}
        onPointerLeave={() => {
          if (grab.current === null) return
          grab.current = null
          setGrabbing(false)
        }}
        /* Without this the middle button starts Chromium's own scrolling. */
        onAuxClick={(event) => event.preventDefault()}
        onWheel={(event) => {
          /* Shift pans, because at a quarter-second across the window the
             thing you are looking for is usually just off the edge. */
          const notches = event.deltaY / 100

          if (event.shiftKey) {
            setCentre(
              clampViewCentre(middle + notches * visible * panSpeed, visible, [songStart, songEnd])
            )
            return
          }

          /* Hold the instant under the pointer still while the window grows or
             shrinks around it. */
          zoomBy(2 ** (notches * zoomSpeed), timeAt(event.clientX))
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
            ? 'Add a click track from the mixer to line one up.'
            : `${timing.beatCount} beats · ${timing.bpm.toFixed(1)} bpm · drag the handles, or arrow keys to nudge · scroll to zoom, middle-drag or shift-scroll to pan`}
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
