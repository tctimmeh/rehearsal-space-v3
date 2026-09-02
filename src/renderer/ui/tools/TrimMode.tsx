import { useRef } from 'react'

import type { AudioChannel } from '@core/song/song'
import { keepAll, keepPart, keptPart, LEAST_KEPT, sourceLength, startAt } from '@core/song/trim'
import { Button } from '../primitives'
import { Handle, Offscreen, inView, type View } from './waveformParts'

/**
 * Cutting the ends off a take, and putting it where it belongs.
 *
 * Both are done by looking at the music rather than by typing a number: the
 * silence before the first note is something you can see, and so is the place
 * a part has to land against everything else.
 *
 * Nothing is taken out of the file. What is cut off is drawn, quietly, either
 * side of what is kept — so it can be seen and let back in.
 */
export function TrimControls({
  channel,
  view,
  onChange
}: {
  channel: AudioChannel | null
  view: View
  onChange: (channel: AudioChannel) => void
}) {
  if (channel === null) {
    return <span className="setting-note">Pick a channel to trim.</span>
  }

  const kept = keptPart(channel)
  const whole = sourceLength(channel)
  const trimmed = kept.from > 0 || kept.to < whole - 0.001

  return (
    <>
      {trimmed ? <Button onClick={() => onChange(keepAll(channel))}>Keep all</Button> : null}
      <span className="setting-note">
        {trimmed
          ? `Keeping ${(kept.to - kept.from).toFixed(2)}s of ${whole.toFixed(2)}s, from ` +
            `${view.clock(channel.startTime)} · drag the ends to trim, the middle to move it`
          : `${whole.toFixed(2)}s from ${view.clock(channel.startTime)} · drag the ends to trim, ` +
            'the middle to move it'}
      </span>
    </>
  )
}

export function TrimMarks({
  channel,
  view,
  onChange
}: {
  channel: AudioChannel | null
  view: View
  onChange: (channel: AudioChannel) => void
}) {
  /* Where the take was when a move began, and where the pointer took hold of
     it. A move is a difference, not a position: grabbing it in the middle and
     dragging must not snap its beginning under the pointer. */
  const held = useRef<{ x: number; startTime: number } | null>(null)

  if (channel === null) return null

  const kept = keptPart(channel)
  const whole = sourceLength(channel)
  /* The file's own beginning in song time, which is where the part that was
     cut off still lies. */
  const fileFrom = channel.startTime - kept.from
  const ends = channel.startTime + channel.duration

  const trimFrom = (clientX: number) =>
    onChange(keepPart(channel, view.timeAt(clientX) - fileFrom, kept.to))
  const trimTo = (clientX: number) =>
    onChange(keepPart(channel, kept.from, Math.max(view.timeAt(clientX) - fileFrom, kept.from + LEAST_KEPT)))

  return (
    <>
      {/* What was cut off, still there and still in its place. */}
      {kept.from > 0 ? (
        <span
          className="align__cut"
          style={{ left: view.xOf(fileFrom), width: widthOf(fileFrom, channel.startTime, view) }}
        />
      ) : null}
      {kept.to < whole ? (
        <span
          className="align__cut"
          style={{ left: view.xOf(ends), width: widthOf(ends, fileFrom + whole, view) }}
        />
      ) : null}

      <span
        className="align__kept"
        role="slider"
        aria-label={`Starts at ${view.clock(channel.startTime)}`}
        aria-valuenow={channel.startTime}
        aria-valuetext={`Starts at ${view.clock(channel.startTime)}`}
        style={{ left: view.xOf(channel.startTime), width: widthOf(channel.startTime, ends, view) }}
        onPointerDown={(event) => {
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          held.current = { x: event.clientX, startTime: channel.startTime }
        }}
        onPointerMove={(event) => {
          const from = held.current
          if (from === null) return
          const moved = view.timeAt(event.clientX) - view.timeAt(from.x)
          onChange(startAt(channel, from.startTime + moved))
        }}
        onPointerUp={(event) => {
          held.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
      />

      {inView(channel.startTime, view) ? (
        <Handle
          className="align__handle align__handle--trim-start"
          label={`Trim from ${view.clock(channel.startTime)}`}
          time={channel.startTime}
          left={view.xOf(channel.startTime)}
          onDrag={trimFrom}
        />
      ) : (
        <Offscreen side={channel.startTime < view.from ? 'left' : 'right'} kind="trim from" />
      )}
      {inView(ends, view) ? (
        <Handle
          className="align__handle align__handle--trim-end"
          label={`Trim to ${view.clock(ends)}`}
          time={ends}
          left={view.xOf(ends)}
          onDrag={trimTo}
        />
      ) : (
        <Offscreen side={ends < view.from ? 'left' : 'right'} kind="trim to" />
      )}
    </>
  )
}

const widthOf = (from: number, to: number, view: View): string =>
  `${((to - from) / (view.to - view.from)) * 100}%`
