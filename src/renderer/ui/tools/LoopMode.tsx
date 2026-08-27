import type { LoopRegion } from '@core/song/song'
import { Button } from '../primitives'
import { Handle, Offscreen, inView, type View } from './waveformParts'

/**
 * Marking out the stretch to go round.
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
  return (
    <>
      <span className="align__divider" />
      {loop === null ? (
        /* There has to be something to take hold of before it can be dragged,
           and what is on screen is what is being looked at. */
        <Button onClick={() => onChange({ start: view.from, end: view.to })}>
          Set region to what is shown
        </Button>
      ) : (
        <>
          <span className="setting-note">
            {view.clock(loop.start)} – {view.clock(loop.end)} · drag the ends
          </span>
          <Button onClick={() => onChange(null)}>Clear region</Button>
        </>
      )}
    </>
  )
}

export function LoopMarks({
  loop,
  view,
  onChange
}: {
  loop: LoopRegion | null
  view: View
  onChange: (loop: LoopRegion) => void
}) {
  if (loop === null) return null

  /* Dragging one end past the other would leave a region that runs backwards,
     which nothing downstream would know what to do with. */
  const dragStart = (clientX: number) =>
    onChange({ ...loop, start: Math.min(view.timeAt(clientX), loop.end - MIN_LENGTH) })
  const dragEnd = (clientX: number) =>
    onChange({ ...loop, end: Math.max(view.timeAt(clientX), loop.start + MIN_LENGTH) })

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
          left={view.xOf(loop.start)}
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
          left={view.xOf(loop.end)}
          onDrag={dragEnd}
        />
      ) : (
        <Offscreen side={loop.end < view.from ? 'left' : 'right'} kind="loop to" />
      )}
    </>
  )
}

/** Short enough to be a mistake rather than a choice. */
const MIN_LENGTH = 0.1

const percent = (time: number, view: View): number =>
  ((time - view.from) / (view.to - view.from)) * 100
