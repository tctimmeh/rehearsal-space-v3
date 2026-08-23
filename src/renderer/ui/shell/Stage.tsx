import type { ReactNode } from 'react'

interface StageProps {
  title: string
  meta?: string
  onClose: () => void
  children: ReactNode
}

export function Stage({ title, meta, onClose, children }: StageProps) {
  return (
    <section className="stage">
      <div className="stage__cap">
        <span className="stage__name">{title}</span>
        {meta === undefined ? null : <span className="stage__meta">{meta}</span>}
        <button type="button" className="close-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="stage__body">{children}</div>
    </section>
  )
}

export function StageEmpty() {
  return (
    <section className="stage">
      <div className="stage__body">
        <p className="stage-empty">
          Pick a tool from the rail.
          <br />
          Nothing is open.
        </p>
      </div>
    </section>
  )
}
