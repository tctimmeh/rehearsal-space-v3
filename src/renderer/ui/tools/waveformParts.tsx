import type { ReactNode } from 'react'

/**
 * The pieces every job in the waveform area shares: what part of the song is
 * on screen, and how to put something on it.
 */
export interface View {
  from: number
  to: number
  /** Where a pointer is, in song time. */
  timeAt: (clientX: number) => number
  /** Where a moment in the song is, as a CSS offset across the strip. */
  xOf: (time: number) => string
  /** Whole seconds are useless once the window is short. */
  clock: (time: number) => string
}

export const inView = (time: number, view: View): boolean =>
  time >= view.from && time <= view.to

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="align__picker">
      <span>{label}</span>
      {children}
    </label>
  )
}

/** Says which way an off-screen handle lies, so it can be panned back to. */
export function Offscreen({ side, kind }: { side: 'left' | 'right'; kind: string }) {
  return (
    <span className={`align__offscreen align__offscreen--${side}`}>
      {side === 'left' ? '‹' : '›'} {kind}
    </span>
  )
}

export function Handle({
  className,
  label,
  time,
  left,
  onDrag
}: {
  className: string
  label: string
  time: number
  left: string
  onDrag: (clientX: number) => void
}) {
  return (
    <span
      className={className}
      style={{ left }}
      role="slider"
      aria-label={label}
      aria-valuenow={time}
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        onDrag(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) onDrag(event.clientX)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
    >
      <span className="align__flag">{label}</span>
    </span>
  )
}

export function Picker({
  label,
  value,
  options,
  onChange,
  empty,
  allowNone
}: {
  label: string
  value: string
  options: { id: string; label: string }[]
  onChange: (id: string) => void
  empty?: string
  /** Offers picking nothing at all, under this name. */
  allowNone?: string
}) {
  return (
    <label className="align__picker">
      <span>{label}</span>
      <select
        className="well input"
        value={value}
        disabled={options.length === 0 && allowNone === undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option>{empty ?? 'None'}</option> : null}
        {allowNone === undefined ? null : <option value="">{allowNone}</option>}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
