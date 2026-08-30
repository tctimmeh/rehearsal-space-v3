import { useCallback, useRef, useState } from 'react'

interface DragValueOptions {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  /** Pixels of travel that sweep the control from min to max. */
  travel?: number
  /** 'y' drags upward to increase (knobs, faders); 'x' drags rightward. */
  axis?: 'x' | 'y'
}

const FINE_FACTOR = 0.25

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function quantize(value: number, min: number, max: number, step: number): number {
  return clamp(Math.round(value / step) * step, min, max)
}

/**
 * Click-and-drag plus scroll wheel, which is how every knob and fader in the
 * app is operated. Pointer capture keeps the drag alive outside the element,
 * and holding shift drops into a finer sweep for cents-level work.
 */
export function useDragValue({
  value,
  min,
  max,
  step,
  onChange,
  travel = 200,
  axis = 'y'
}: DragValueOptions) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef({ pointer: 0, value: 0 })

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      origin.current = { pointer: axis === 'y' ? event.clientY : event.clientX, value }
      setDragging(true)
    },
    [axis, value]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragging) return
      const current = axis === 'y' ? event.clientY : event.clientX
      const moved = axis === 'y' ? origin.current.pointer - current : current - origin.current.pointer
      const sweep = ((max - min) / travel) * (event.shiftKey ? FINE_FACTOR : 1)
      onChange(quantize(origin.current.value + moved * sweep, min, max, step))
    },
    [axis, dragging, max, min, onChange, step, travel]
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragging(false)
  }, [])

  const onWheel = useCallback(
    (event: React.WheelEvent<HTMLElement>) => {
      /* Answered here, so it is not answered again by whatever this sits in.
         Without this, nudging a fader in the mixer also slides the mixer. */
      event.stopPropagation()
      const direction = event.deltaY < 0 ? 1 : -1
      const amount = step * (event.shiftKey ? FINE_FACTOR : 1)
      onChange(quantize(value + direction * amount, min, max, step))
    },
    [max, min, onChange, step, value]
  )

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onWheel
    }
  }
}
