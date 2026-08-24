/**
 * Song time can be negative — a count-in metronome starts before 00:00 — so
 * every clock in the app has to render a sign.
 */
export function formatClock(seconds: number): string {
  const rounded = Math.trunc(Math.abs(seconds))
  const minutes = Math.trunc(rounded / 60)
  const remainder = rounded % 60
  const sign = seconds < 0 ? '-' : ''
  return `${sign}${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

/** The countdown shown at the right of the scrub bar, always signed. */
export function formatRemaining(position: number, end: number): string {
  const remaining = Math.max(0, end - position)
  return `-${formatClock(remaining)}`
}

/**
 * A clock fine enough to align against. Whole seconds say nothing when a
 * quarter of a second fills the window, so below a couple of seconds of span
 * the thousandths are what matter.
 */
export function formatClockPrecise(seconds: number): string {
  const rounded = Math.abs(seconds)
  const minutes = Math.trunc(rounded / 60)
  const remainder = rounded % 60
  const sign = seconds < 0 ? '-' : ''
  return `${sign}${String(minutes).padStart(2, '0')}:${remainder.toFixed(3).padStart(6, '0')}`
}
