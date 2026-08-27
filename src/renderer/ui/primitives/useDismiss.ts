import { useEffect, useRef, type RefObject } from 'react'

/**
 * Closes a panel when the pointer goes down outside it, or on Escape.
 *
 * Returns the ref to put on whatever counts as inside. Three things in the
 * header now hang a panel off a button, and they should all let go of it the
 * same way.
 */
export function useDismiss<T extends HTMLElement>(
  open: boolean,
  close: () => void
): RefObject<T | null> {
  const wrap = useRef<T>(null)
  /* Held in a ref so an inline arrow does not re-subscribe on every render. */
  const latest = useRef(close)
  latest.current = close

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) latest.current()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return wrap
}
