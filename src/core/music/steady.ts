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
