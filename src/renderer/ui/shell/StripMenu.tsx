import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { escapeAnswered } from '../primitives'

const GAP = 7
const EDGE = 8

/**
 * A button in the mixer that opens a short list of things to do.
 *
 * The dock is the only place channels are seen now, so it is where they are
 * managed from — rather than in a separate view that had to be gone to,
 * changed, and come back from.
 *
 * The list is rendered through a portal and placed by measurement: the strips
 * scroll sideways, and anything drawn inside that scroller is cut off at its
 * edge. It opens upwards because the dock is the floor of the window.
 */
export function StripMenu({
  label,
  face,
  className = '',
  children
}: {
  label: string
  face: ReactNode
  className?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState({ left: 0, bottom: 0 })
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)

  /*
   * Measured after the list exists rather than assumed, so it can be as wide
   * as its longest item and no wider. This runs before the frame is painted,
   * so the list is never seen in the place it was first put.
   */
  useLayoutEffect(() => {
    if (!open) return
    const rect = button.current?.getBoundingClientRect()
    if (rect === undefined) return
    const width = list.current?.offsetWidth ?? 0
    setAt({
      left: Math.max(EDGE, Math.min(rect.left, window.innerWidth - width - EDGE)),
      bottom: window.innerHeight - rect.top + GAP
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (button.current?.contains(target) === true) return
      if (list.current?.contains(target) === true) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      escapeAnswered(event)
      setOpen(false)
    }
    /* Scrolling the strips would leave the list behind where it was. */
    const close = () => setOpen(false)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', close)
    document.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', close)
      document.removeEventListener('scroll', close, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`raised ${className}`}
        aria-label={label}
        aria-expanded={open}
        data-engaged={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {face}
      </button>

      {open
        ? createPortal(
            <div
              ref={list}
              className="menu strip-menu__list"
              role="menu"
              style={{ left: at.left, bottom: at.bottom }}
            >
              {children(() => setOpen(false))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function StripMenuItem({
  label,
  onClick,
  disabled = false,
  title
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Why it cannot be pressed, since a greyed item explains nothing itself. */
  title?: string
}) {
  return (
    <button
      type="button"
      className="menu__item"
      role="menuitem"
      disabled={disabled}
      {...(title === undefined ? {} : { title })}
      onClick={onClick}
    >
      <span>{label}</span>
    </button>
  )
}
