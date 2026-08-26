/** Enough to settle a wavering reading, few enough to follow a tuning peg. */
const KEEP = 5

/**
 * A run of recent readings, newest last.
 *
 * A pitch detector answers every window independently, and a plucked string is
 * not the same from one window to the next — it wobbles as it decays, and now
 * and then a window catches a scrape or the very start of the pluck and reads
 * something else entirely. Showing each answer as it arrives gives a display
 * nobody can tune against.
 */
export function addReading(recent: readonly number[], hz: number): number[] {
  return [...recent, hz].slice(-KEEP)
}

/**
 * The middle reading, which is the one to show.
 *
 * The middle rather than the average: a single window that heard an octave up
 * would drag an average halfway there, and is simply ignored by the middle.
 */
export function steadyHz(recent: readonly number[]): number | null {
  if (recent.length === 0) return null
  const sorted = [...recent].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

/**
 * How far the shown pitch moves toward a new reading each time one arrives.
 *
 * Readings land twenty times a second. An eighth of the way each time settles
 * in about four fifths of a second — slow enough that a wavering string reads
 * as one pitch and the needle sits still enough to tune against, quick enough
 * that turning a peg is followed rather than reported afterwards.
 */
const SETTLE = 0.12

/** Beyond this the string has been changed, not merely wavered. */
const JUMP_CENTS = 40

/**
 * Eases the shown pitch toward the reading rather than snapping to it.
 *
 * The middle reading throws out the wild ones; this smooths what is left,
 * which is the string itself moving — a plucked note is never quite still, and
 * a needle that answers every flicker of it cannot be tuned against.
 *
 * The easing is done in cents rather than in hertz, because a needle moves in
 * cents: the same drift near the bottom of a bass is a fraction of the hertz
 * it is at the top of a fiddle.
 */
export function glideHz(shown: number | null, target: number): number {
  if (shown === null || shown <= 0 || target <= 0) return target
  const distance = 1200 * Math.log2(target / shown)
  if (Math.abs(distance) >= JUMP_CENTS) return target
  return shown * 2 ** ((distance * SETTLE) / 1200)
}
