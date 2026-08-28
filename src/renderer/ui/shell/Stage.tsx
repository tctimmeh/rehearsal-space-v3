import type { ReactNode } from 'react'

interface StageProps {
  title: string
  meta?: string
  /** Absent for whatever the stage falls back to: there is nothing behind it. */
  onClose?: () => void
  children: ReactNode
}

export function Stage({ title, meta, onClose, children }: StageProps) {
  return (
    <section className="stage">
      <div className="stage__cap">
        <span className="stage__name">{title}</span>
        {meta === undefined ? null : <span className="stage__meta">{meta}</span>}
        {onClose === undefined ? null : (
          <button type="button" className="close-x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <div className="stage__body">{children}</div>
    </section>
  )
}

