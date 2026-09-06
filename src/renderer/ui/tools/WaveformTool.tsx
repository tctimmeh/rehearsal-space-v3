import { useEffect, useMemo, useRef, useState } from 'react'

import { solveMetronome, type MetronomeTiming } from '@core/metronome/solve'
import { CHANNEL_SUBJECT_COLOR } from '@core/song/channelSubject'
import { centreToShow, clampViewCentre } from '@core/song/viewWindow'
import type { AudioChannel, LoopRegion, MetronomeChannel, Song } from '@core/song/song'
import { formatClock, formatClockPrecise } from '@core/time'
import { useAlign } from '@renderer/state/align'
import { useWaveformView, windowOf } from '@renderer/state/waveformView'
import { useConfig } from '@renderer/state/config'
import { useSong } from '@renderer/state/song'
import { useTransport } from '@renderer/state/transport'
import { Waveform } from './Waveform'
import { Tabs } from '../primitives'
import { usePeaks } from './usePeaks'
import { ClickTrackControls, ClickTrackMarks } from './ClickTrackMode'
import { LoopControls, LoopMarks, MIN_LENGTH, regionBetween } from './LoopMode'
import { TrimControls, TrimMarks } from './TrimMode'
import { Picker, type View } from './waveformParts'

/**
 * Whatever needs the waveform: anything set by looking at the music rather
 * than by typing a number. One area, one set of eyes on the song, and a job
 * chosen at the top.
 */
const JOBS = [
  { id: 'loop', label: 'Loop region' },
  { id: 'trim', label: 'Trim' },
  { id: 'click', label: 'Click align' }
] as const
type Job = (typeof JOBS)[number]['id']

/* Tall enough to read quiet passages by; centred in whatever room the strip
   has, so the trace sits on the middle rather than hanging from the top. */
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
      ? `Shift-drag to mark a stretch to go round and round · ${moving}`
      : `Looping ${(loop.end - loop.start).toFixed(1)}s · ${moving}`
  }
  if (job === 'trim') return `Drag the ends to trim, the middle to move it · ${moving}`
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

  /* The tab and the channel belong to the song and come back with it. */
  const job: Job = song?.waveform.tab ?? 'loop'
  const setJob = (tab: Job) => update({ waveform: { ...(song as Song).waveform, tab } })
  const againstId = song?.waveform.channel ?? null
  const setAgainstId = (channel: string | null) =>
    update({ waveform: { ...(song as Song).waveform, channel } })

  /* The zoom and pan only last as long as the app does. A song not looked at
     this session opens on the whole of itself, which is the only view that
     tells you what is there. */
  const windows = useWaveformView((state) => state.windows)
  const remember = useWaveformView((state) => state.remember)
  const kept = windowOf(windows, song?.id ?? null)
  const keep = (patch: Partial<typeof kept>) => {
    if (song !== null) remember(song.id, patch)
  }
  const [clickId, setClickId] = useState<string | null>(null)
  const pointedAt = useAlign((state) => state.clickId)

  /* Whatever the tool was opened for wins, until another one is chosen here —
     and it is opened to be worked on, so the view goes to it rather than
     leaving it a speck in a view of the whole song. */
  useEffect(() => {
    if (pointedAt === null || song === null) return
    setClickId(pointedAt)
    const timing = song.channels.find((c) => c.id === pointedAt)
    update({ waveform: { ...song.waveform, tab: 'click' } })
    remember(song.id, {
      span: DEFAULT_SPAN,
      ...(timing !== undefined && timing.kind === 'metronome' ? { centre: timing.endTime } : {})
    })
  }, [pointedAt])
  const span = kept.span
  const setSpan = (next: number) => keep({ span: next })
  const centre = kept.centre
  const setCentre = (next: number) => keep({ centre: next })
  const panSpeed = useConfig((state) => state.config?.panSpeed ?? 0.1)
  const zoomSpeed = useConfig((state) => state.config?.zoomSpeed ?? 0.15)
  /* Where a middle-button drag took hold, and where the view was then. */
  const grab = useRef<{ x: number; centre: number } | null>(null)
  const [grabbing, setGrabbing] = useState(false)
  /* Held in a ref as well as in state: the first move of a drag arrives before
     a re-render would have told the handler that a drag had started. */
  const scrubbing = useRef(false)
  const [showScrub, setShowScrub] = useState(false)
  /* Where a shift-drag took hold, and the region it has drawn out so far. The
     song only hears about it once the button comes up: a region is the whole
     gesture, not every pixel of it. */
  const drawingFrom = useRef<number | null>(null)
  const [drawn, setDrawn] = useState<LoopRegion | null>(null)

  const against = audio.find((c) => c.id === againstId) ?? audio[0] ?? null
  const click = clicks.find((c) => c.id === clickId) ?? clicks[0] ?? null
  const peaks = usePeaks(song?.id, against?.id)
  /* A second channel drawn underneath, to line the first one up against.
     Trimming and placing a take is done against something else. */
  const beneathId = song?.waveform.against ?? null
  const setBeneathId = (channel: string | null) =>
    update({ waveform: { ...(song as Song).waveform, against: channel === '' ? null : channel } })
  /* Only while trimming. It is there to line a take up against, and drawn
     under any other job it is a second trace nobody asked for, half the height
     of the one they are working on. */
  const beneath =
    job === 'trim' ? (audio.find((c) => c.id === beneathId && c.id !== against?.id) ?? null) : null
  const beneathPeaks = usePeaks(song?.id, beneath?.id)

  const timing = useMemo(() => (click === null ? null : solveMetronome(click)), [click])
  /* Follow the click being aligned until the user pans somewhere else, and
     never past the song — there is nothing out there to look at. Clamped on
     the way out as well as in, so zooming out cannot strand the view. */
  /* No wider than the song plus a little air: there is nothing beyond it. */
  /*
   * The song's own bounds move while a handle is dragged: the click's start
   * *is* the start of the song when it comes before the music. Everything
   * about the view is worked out from those bounds — how far it may scroll,
   * how far out it may zoom, and where it sits when the whole song is on
   * screen — so a drag was moving the music it was being aimed at, and
   * changing the zoom while it did.
   *
   * While something is held the view reckons on where things stood when it
   * was taken hold of, widened only by wherever the handle has since gone.
   */
  const [grip, setGrip] = useState<{ bounds: [number, number]; at: number } | null>(null)
  const [boundsFrom, boundsTo]: [number, number] =
    grip === null
      ? [songStart, songEnd]
      : [Math.min(grip.bounds[0], grip.at), Math.max(grip.bounds[1], grip.at)]
  const bounds: [number, number] = [boundsFrom, boundsTo]

  const maxSpan = Math.max(DEFAULT_SPAN, boundsTo - boundsFrom + 2)
  const visible = Math.min(maxSpan, Math.max(MIN_SPAN, span ?? maxSpan))
  /*
   * Half a window of air past each end of the song.
   *
   * A count-in begins before 00:00 and its first click is what is being
   * aimed; with the view stopping a second short of the song there was
   * nowhere to stand to look at it, and the handle had to be judged against
   * the very edge of the strip.
   */
  const air = visible / 2

  const middle = clampViewCentre(centre ?? timing?.endTime ?? 0, visible, bounds, air)
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
    setCentre(clampViewCentre(at + (middle - at) * (next / visible), next, bounds, next / 2))
    setSpan(next)
  }

  const strip = useRef<HTMLDivElement>(null)
  const timeAt = (clientX: number): number => {
    const box = strip.current?.getBoundingClientRect()
    if (box === undefined || box.width === 0) return from
    return from + ((clientX - box.left) / box.width) * (to - from)
  }
  const xOf = (time: number): string => `${((time - from) / (to - from)) * 100}%`

  const view: View = {
    from,
    to,
    timeAt,
    xOf,
    clock,
    /* Pinned where it stands: until now the centre could still be the click's
       own end, which a drag moves. */
    hold: () => {
      setGrip({ bounds: [songStart, songEnd], at: middle })
      setCentre(middle)
    },
    follow: (at) => {
      setGrip((held) => (held === null ? held : { ...held, at }))
      setCentre(centreToShow(at, middle, visible))
    },
    letGo: () => setGrip(null)
  }

  if (song === null) return <p className="tool-placeholder">No song loaded.</p>
  if (audio.length === 0) {
    return <p className="tool-placeholder">Import some audio to line a click track up against.</p>
  }

  const changeChannel = (next: AudioChannel) => {
    if (song === null) return
    update({ channels: song.channels.map((c) => (c.id === next.id ? next : c)) })
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
          label="Channel"
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
        ) : job === 'trim' ? (
          <>
            <Picker
              label="Against"
              value={beneath?.id ?? ''}
              options={audio
                .filter((c) => c.id !== against?.id)
                .map((c) => ({ id: c.id, label: c.name }))}
              onChange={setBeneathId}
              allowNone="Nothing"
            />
            <TrimControls channel={against} view={view} onChange={changeChannel} />
          </>
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

          /* Shift draws a region out, which is how one is made in the first
             place — there is nothing to take hold of until there is one. */
          if (job === 'loop' && event.shiftKey) {
            event.preventDefault()
            const at = timeAt(event.clientX)
            drawingFrom.current = at
            setDrawn({ start: at, end: at })
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* No capture; the drag still works within the strip. */
            }
            return
          }

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
          const drawnFrom = drawingFrom.current
          if (drawnFrom !== null) {
            setDrawn(regionBetween(drawnFrom, timeAt(event.clientX)))
            return
          }
          if (scrubbing.current) {
            seek(timeAt(event.clientX))
            return
          }
          const held = grab.current
          const box = strip.current?.getBoundingClientRect()
          if (held === null || box === undefined || box.width === 0) return
          const moved = ((event.clientX - held.x) / box.width) * visible
          setCentre(clampViewCentre(held.centre - moved, visible, bounds, air))
        }}
        onPointerUp={(event) => {
          const drawnFrom = drawingFrom.current
          if (drawnFrom !== null) {
            drawingFrom.current = null
            /* Taken from where the button came up rather than from what has
               been drawn so far: the last move of a drag can arrive too late
               to have been rendered, and the region would come up short. */
            const region = regionBetween(drawnFrom, timeAt(event.clientX))
            /* A region that short is a click that slipped, not a decision. */
            if (region.end - region.start >= MIN_LENGTH) setRegion(region)
            setDrawn(null)
            try {
              event.currentTarget.releasePointerCapture(event.pointerId)
            } catch {
              /* Never captured. */
            }
            return
          }
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
          drawingFrom.current = null
          setDrawn(null)
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
              clampViewCentre(middle + notches * visible * panSpeed, visible, bounds, air)
            )
            return
          }

          /* Hold the instant under the pointer still while the window grows or
             shrinks around it. */
          zoomBy(2 ** (notches * zoomSpeed), timeAt(event.clientX))
        }}
      >
        <div className="align__traces">
          <Waveform
            peaks={peaks}
            from={from}
            to={to}
            /* The file's own beginning, which is not where it starts playing
               once it has been trimmed. Drawn from there, what was cut off
               lies where it always did rather than shifting the rest out of
               true. */
            offset={(against?.startTime ?? 0) - (against?.offset ?? 0)}
            color={CHANNEL_SUBJECT_COLOR[against?.subject ?? 'other']}
            height={beneath === null ? WAVE_HEIGHT : WAVE_HEIGHT / 2}
          />
          {beneath === null ? null : (
            <Waveform
              peaks={beneathPeaks}
              from={from}
              to={to}
              offset={beneath.startTime - (beneath.offset ?? 0)}
              color={CHANNEL_SUBJECT_COLOR[beneath.subject]}
              height={WAVE_HEIGHT / 2}
            />
          )}
        </div>

        {job === 'click' ? (
          <ClickTrackMarks timing={timing} view={view} change={change} />
        ) : job === 'trim' ? (
          <TrimMarks channel={against} view={view} onChange={changeChannel} />
        ) : (
          <LoopMarks
            loop={drawn ?? loop}
            view={view}
            drawing={drawn !== null}
            onChange={setRegion}
          />
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
