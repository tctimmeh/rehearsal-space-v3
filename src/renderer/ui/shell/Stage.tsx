import type { ReactNode } from 'react'

interface StageProps {
  title: string
  meta?: string
  children: ReactNode
}

/*
 * No close button. The stage is never empty — closing a tool only puts the
 * waveform back — so the cross offered to do a thing that has no visible
 * result, and it was there for some tools and not others depending on which
 * one had fallen onto the stage. The rail button that opened a tool closes it.
 */
export function Stage({ title, meta, children }: StageProps) {
  return (
    <section className="stage">
      <div className="stage__cap">
        <span className="stage__name">{title}</span>
        {meta === undefined ? null : <span className="stage__meta">{meta}</span>}
      </div>
      <div className="stage__body">{children}</div>
    </section>
  )
}

