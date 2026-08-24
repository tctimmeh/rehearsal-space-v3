import { useMemo, useRef, useState } from 'react'

import { beatsBetween, solveMetronome } from '@core/metronome/solve'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import type { AudioChannel, MetronomeChannel } from '@core/song/song'
import { formatClock } from '@core/time'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { Button } from '../primitives'
import { Waveform } from './Waveform'
import { usePeaks } from './usePeaks'

const WAVE_HEIGHT = 190
const ZOOM_STEPS = [0.25, 0.5, 1, 2, 4, 8, 20, 60, 180]
const DEFAULT_ZOOM = 4

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

  const audio = (song?.channels.filter((c) => c.kind === 'audio') ?? []) as AudioChannel[]
  const clicks = (song?.channels.filter((c) => c.kind === 'metronome') ?? []) as MetronomeChannel[]

  const [againstId, setAgainstId] = useState<string | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const [spanIndex, setSpanIndex] = useState(DEFAULT_ZOOM)
  const [centre, setCentre] = useState<number | null>(null)

  const against = audio.find((c) => c.id === againstId) ?? audio[0] ?? null
  const click = clicks.find((c) => c.id === clickId) ?? clicks[0] ?? null
  const peaks = usePeaks(song?.id, against?.id)

  const timing = useMemo(() => (click === null ? null : solveMetronome(click)), [click])
  const span = ZOOM_STEPS[spanIndex] ?? 4
  /* Follow the click being aligned until the user pans somewhere else. */
  const middle = centre ?? timing?.endTime ?? 0
  const from = middle - span / 2
  const to = middle + span / 2

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

  const dragEnd = (clientX: number) => {
    if (click === null) return
    update({
      channels: song.channels.map((c) =>
        c.id === click.id ? { ...click, endTime: timeAt(clientX) } : c
      )
    })
  }

  /*
   * What the start handle means depends on how the channel's length is set.
   * Pinned by start time, it is the start. Counted in measures, the start is
   * derived — so dragging it changes how many measures there are, which is the
   * only thing that can move it without contradicting the tempo.
   */
  const dragStart = (clientX: number) => {
    if (click === null || timing === null) return
    const wanted = timeAt(clientX)
    const duration =
      click.duration.mode === 'startTime'
        ? { ...click.duration, startTime: wanted }
        : {
            ...click.duration,
            measures: Math.max(
              1,
              Math.round((click.endTime - wanted) / (timing.beatDuration * timing.beatsPerMeasure))
            )
          }
    update({
      channels: song.channels.map((c) => (c.id === click.id ? { ...click, duration } : c))
    })
  }

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
          empty="No click track yet"
        />
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
          if (event.shiftKey) {
            setCentre(middle + (event.deltaY / 200) * span)
            return
          }
          /* Hold the instant under the pointer still. The zoom steps are not
             in a constant ratio, so the ratio has to be taken from the steps
             themselves — guessing at it makes the view creep away from the
             transient being aimed at, a little more with every notch. */
          const at = timeAt(event.clientX)
          const next = Math.min(
            ZOOM_STEPS.length - 1,
            Math.max(0, spanIndex + (event.deltaY < 0 ? -1 : 1))
          )
          const nextSpan = ZOOM_STEPS[next] ?? span
          setCentre(at + (middle - at) * (nextSpan / span))
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
                label={`Start ${formatClock(timing.startTime)}`}
                left={xOf(timing.startTime)}
                onDrag={dragStart}
              />
            ) : (
              <Offscreen side={timing.startTime < from ? 'left' : 'right'} kind="start" />
            )}
            {inView(timing.endTime, from, to) ? (
              <Handle
                className="align__handle align__handle--end"
                label={`End ${formatClock(timing.endTime)}`}
                left={xOf(timing.endTime)}
                onDrag={dragEnd}
              />
            ) : (
              <Offscreen side={timing.endTime < from ? 'left' : 'right'} kind="end" />
            )}
          </>
        )}

        <span className="align__playhead" style={{ left: xOf(position) }} />
      </div>

      <div className="align__scale">
        <span className="num">{formatClock(from)}</span>
        <span className="setting-note">
          {timing === null
            ? 'Add a metronome channel in Setup to line one up.'
            : `${timing.beatCount} beats · ${timing.bpm.toFixed(1)} bpm · drag the handles onto the music · scroll to zoom, shift to pan`}
        </span>
        <span className="num">{formatClock(to)}</span>
      </div>
    </div>
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

function Handle({
  className,
  label,
  left,
  onDrag
}: {
  className: string
  label: string
  left: string
  onDrag: (clientX: number) => void
}) {
  return (
    <span
      className={className}
      style={{ left }}
      role="slider"
      tabIndex={0}
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onDrag(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onDrag(event.clientX)
      }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
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
