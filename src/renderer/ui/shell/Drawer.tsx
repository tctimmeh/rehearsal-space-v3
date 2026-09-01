import { useEffect, type ReactNode } from 'react'

import { escapeAnswered } from '../primitives'

interface DrawerProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Reach for it, take the word, get out — so Esc closes it. */
export function Drawer({ title, onClose, children }: DrawerProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      escapeAnswered(event)
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <aside className="drawer">
      <div className="drawer__cap">
        <span className="drawer__name">{title}</span>
        <button type="button" className="close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="drawer__body">{children}</div>
    </aside>
  )
}
