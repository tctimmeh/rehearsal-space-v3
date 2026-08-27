import { useEffect, useMemo, useRef, useState } from 'react'

import { solveMetronome, type MetronomeTiming } from '@core/metronome/solve'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { clampViewCentre } from '@core/song/viewWindow'
import type { AudioChannel, LoopRegion, MetronomeChannel } from '@core/song/song'
import { formatClock, formatClockPrecise } from '@core/time'
import { useAlign } from '@renderer/state/align'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { Waveform } from './Waveform'
import { Tabs } from '../primitives'
import { usePeaks } from './usePeaks'
import { ClickTrackControls, ClickTrackMarks } from './ClickTrackMode'
import { LoopControls, LoopMarks } from './LoopMode'
import { Picker, type View } from './waveformParts'

/**
 * Whatever needs the waveform: anything set by looking at the music rather
 * than by typing a number. One area, one set of eyes on the song, and a job
 * chosen at the top.
 */
const JOBS = [
  { id: 'click', label: 'Click track' },
  { id: 'loop', label: 'Loop region' }
] as const
type Job = (typeof JOBS)[number]['id']

const WAVE_HEIGHT = 190
const DEFAULT_SPAN = 4
/** Fifty milliseconds across the window is about as close as peaks can say. */
const MIN_SPAN = 0.05
/** Pressing a button is a deliberate step, so it is worth more than a notch. */
const BUTTON_FACTOR = 1.6

/** What the strip has to say for itself, which depends on what is being done. */
const note = (job: Job, timing: MetronomeTiming | null, loop: LoopRegion | null): string => {
  const moving = 'scroll to zoom, middle-drag or shift-scroll to pan'
  if (job === 'loop') {
    return loop === null
      ? `Set a region to go round and round while you work on it · ${moving}`
      : `Looping ${(loop.end - loop.start).toFixed(1)}s · ${moving}`
  }
  return timing === null
    ? 'Add a click track from the mixer to line one up.'
    : `${timing.beatCount} beats · ${timing.bpm.toFixed(1)} bpm · ${moving}`
}

export function WaveformTool() {
  const song = useSong((state) => state.song)
  const update = useSong((state) => state.update)
  const loop = song?.loop ?? null
  const setRegion = (region: LoopRegion | null) => update({ loop: region })
  const position = useTransport((state) => state.position)
  const seek = useTransport((state) => state.seek)
  const songStart = useTransport((state) => state.start)
  const songEnd = useTransport((state) => state.end)

  const audio = (song?.channels.filter((c) => c.kind === 'audio') ?? []) as AudioChannel[]
  const clicks = (song?.channels.filter((c) => c.kind === 'metronome') ?? []) as MetronomeChannel[]

  const [job, setJob] = useState<Job>('click')
  const [againstId, setAgainstId] = useState<string | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const pointedAt = useAlign((state) => state.clickId)

  /* Whatever the tool was opened for wins, until another one is chosen here. */
  useEffect(() => {
    if (pointedAt === null) return
    setClickId(pointedAt)
    setJob('click')
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
  const view: View = { from, to, timeAt, xOf, clock }

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

  return (
    <div className="align">
      <Tabs tabs={JOBS} active={job} onSelect={setJob} />

      <div className="align__controls">
        <Picker
          label="Against"
          value={against?.id ?? ''}
          options={audio.map((c) => ({ id: c.id, label: c.name }))}
          onChange={setAgainstId}
        />
        {job === 'click' ? (
          <ClickTrackControls
            clicks={clicks}
            click={click}
            onPick={setClickId}
            change={change}
          />
        ) : (
          <LoopControls loop={loop} view={view} onChange={setRegion} />
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

        {job === 'click' ? (
          <ClickTrackMarks timing={timing} view={view} change={change} />
        ) : (
          <LoopMarks loop={loop} view={view} onChange={setRegion} />
        )}

        <span className="align__playhead" style={{ left: xOf(position) }} />
      </div>

      <div className="align__scale">
        <span className="num">{clock(from)}</span>
        <span className="setting-note">{note(job, timing, loop)}</span>
      </div>
    </div>
  )
}
