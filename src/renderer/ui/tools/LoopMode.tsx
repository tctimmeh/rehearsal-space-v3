import type { LoopRegion } from '@core/song/song'
import { Button } from '../primitives'
import { Handle, Offscreen, inView, type View } from './waveformParts'

/**
 * Marking out the region to loop.
 *
 * The same job as lining up a click track, done the same way: the ends are
 * where the music says they are, which you find by looking at it.
 */
export function LoopControls({
  loop,
  view,
  onChange
}: {
  loop: LoopRegion | null
  view: View
  onChange: (loop: LoopRegion | null) => void
}) {
  /* The note takes the right of the row to itself; the button belongs beside
     the channel it is drawn against. */
  return loop === null ? (
    <span className="setting-note">Shift-drag across the waveform to mark a region.</span>
  ) : (
    <>
      <Button onClick={() => onChange(null)}>Clear region</Button>
      <span className="setting-note">
        {view.clock(loop.start)} – {view.clock(loop.end)} · drag the ends, or shift-drag to draw a
        new one
      </span>
    </>
  )
}

export function LoopMarks({
  loop,
  view,
  drawing,
  onChange
}: {
  loop: LoopRegion | null
  view: View
  /** True while one is being drawn out, when there is nothing to take hold of. */
  drawing?: boolean
  onChange: (loop: LoopRegion) => void
}) {
  if (loop === null) return null

  if (drawing === true) {
    return (
      <span
        className="align__loop"
        data-drawing="true"
        style={{ left: view.xOf(loop.start), right: `${100 - percent(loop.end, view)}%` }}
      />
    )
  }

  /* Dragging one end past the other would leave a region that runs backwards,
     which nothing downstream would know what to do with. */
  const dragStart = (at: number) =>
    onChange({ ...loop, start: Math.min(at, loop.end - MIN_LENGTH) })
  const dragEnd = (at: number) => onChange({ ...loop, end: Math.max(at, loop.start + MIN_LENGTH) })

  return (
    <>
      <span
        className="align__loop"
        style={{ left: view.xOf(loop.start), right: `${100 - percent(loop.end, view)}%` }}
      />

      {inView(loop.start, view) ? (
        <Handle
          className="align__handle align__handle--loop-start"
          label={`Loop from ${view.clock(loop.start)}`}
          time={loop.start}
          view={view}
          onDrag={dragStart}
        />
      ) : (
        <Offscreen side={loop.start < view.from ? 'left' : 'right'} kind="loop from" />
      )}
      {inView(loop.end, view) ? (
        <Handle
          className="align__handle align__handle--loop-end"
          label={`Loop to ${view.clock(loop.end)}`}
          time={loop.end}
          view={view}
          onDrag={dragEnd}
        />
      ) : (
        <Offscreen side={loop.end < view.from ? 'left' : 'right'} kind="loop to" />
      )}
    </>
  )
}

/** Short enough to be a mistake rather than a choice. */
export const MIN_LENGTH = 0.1

/** Drawn either way round; a region does not care which end you started at. */
export const regionBetween = (one: number, other: number): LoopRegion => ({
  start: Math.min(one, other),
  end: Math.max(one, other)
})

const percent = (time: number, view: View): number =>
  ((time - view.from) / (view.to - view.from)) * 100
