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
  /** A handle has been taken hold of: stop the view drifting under it. */
  hold: () => void
  /** It has been dragged to here: give ground only once it reaches the edge. */
  follow: (time: number) => void
  letGo: () => void
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

/**
 * Something on the strip that is dragged to a moment in the song.
 *
 * It is given the view rather than a position and a pointer coordinate: every
 * handle wants the same three things done with those — drawn where the moment
 * is, told what time a pointer is over, and the view kept from wandering while
 * it is held — and a handle that forgets one of them is a handle that fights
 * the pointer.
 */
export function Handle({
  className,
  label,
  time,
  view,
  onDrag
}: {
  className: string
  label: string
  time: number
  view: View
  /** Where it has been dragged to, in song time. */
  onDrag: (time: number) => void
}) {
  const dragTo = (clientX: number) => {
    const at = view.timeAt(clientX)
    view.follow(at)
    onDrag(at)
  }

  return (
    <span
      className={className}
      style={{ left: view.xOf(time) }}
      role="slider"
      aria-label={label}
      aria-valuenow={time}
      aria-valuetext={label}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        view.hold()
        dragTo(event.clientX)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) dragTo(event.clientX)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
        view.letGo()
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
