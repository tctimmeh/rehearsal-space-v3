import { useCallback, useRef } from 'react'

import { formatClock, formatRemaining } from '@core/time'
import { useTransport } from '@renderer/state/transport'

/**
 * Scrubbing while playing must not stop the audio — the user is listening for
 * where they are as they drag.
 */
export function ScrubBar() {
  const { position, start, end, seek } = useTransport()
  const track = useRef<HTMLDivElement>(null)

  const span = end - start
  const asFraction = (value: number) => (span <= 0 ? 0 : (value - start) / span)

  const seekToPointer = useCallback(
    (clientX: number) => {
      const bounds = track.current?.getBoundingClientRect()
      if (!bounds || bounds.width === 0) return
      const fraction = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width))
      seek(start + fraction * span)
    },
    [seek, span, start]
  )

  return (
    <div className="scrub">
      <span className="scrub__time">{formatClock(position)}</span>
      <div
        ref={track}
        className="scrub__track"
        role="slider"
        tabIndex={0}
        aria-label="Song position"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={position}
        aria-valuetext={formatClock(position)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          seekToPointer(event.clientX)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seekToPointer(event.clientX)
        }}
        onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
      >
        <span className="scrub__fill" style={{ width: `${asFraction(position) * 100}%` }} />
        {start < 0 ? (
          <span className="scrub__countin" style={{ width: `${asFraction(0) * 100}%` }} />
        ) : null}
        <span className="scrub__handle" style={{ left: `${asFraction(position) * 100}%` }} />
      </div>
      <span className="scrub__time scrub__time--end">{formatRemaining(position, end)}</span>
    </div>
  )
}
