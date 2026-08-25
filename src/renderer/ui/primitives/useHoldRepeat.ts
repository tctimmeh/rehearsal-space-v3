import { useCallback, useEffect, useRef } from 'react'

/** Long enough that a single press is never mistaken for a hold. */
const FIRST_WAIT_MS = 420
const SLOW_MS = 110
const FAST_MS = 45
/** Repeats at the slow rate before winding up, so small changes stay easy. */
const BEFORE_WINDING_UP = 6

/**
 * Fires while a button is held down, faster the longer it is held.
 *
 * A control that steps by one needs a hold to be usable at all — nobody is
 * going to click sixty times to get from 100 to 160 — and a hold that never
 * winds up is barely better.
 */
export function useHoldRepeat(step: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(0)
  const latest = useRef(step)
  latest.current = step

  const stop = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    fired.current = 0
  }, [])

  const again = useCallback(() => {
    fired.current += 1
    latest.current()
    const wait = fired.current > BEFORE_WINDING_UP ? FAST_MS : SLOW_MS
    timer.current = setTimeout(again, wait)
  }, [])

  const begin = useCallback(() => {
    stop()
    latest.current()
    timer.current = setTimeout(again, FIRST_WAIT_MS)
  }, [again, stop])

  useEffect(() => stop, [stop])

  return {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      /* Captured so that letting go anywhere still stops it. Without this a
         pointer released off the button would repeat until the app closed. */
      event.currentTarget.setPointerCapture?.(event.pointerId)
      begin()
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    /* A key held down repeats by itself, so this only starts and stops. */
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      if (event.repeat) latest.current()
      else begin()
    },
    onKeyUp: stop,
    onBlur: stop
  }
}
