import { clampBpm } from './solve'

/**
 * Longer than the slowest beat the app will play, so that tapping a genuinely
 * slow tempo is not mistaken for starting again.
 */
export const TAP_TIMEOUT_S = 3.5

/** Enough taps to settle, few enough to follow someone changing their mind. */
const MAX_TAPS = 6

const SECONDS_PER_MINUTE = 60

/**
 * The taps to reckon from, once this one is added.
 *
 * A long enough gap starts a fresh count rather than averaging across the
 * pause — otherwise walking away and coming back gives a tempo drawn from a
 * gap that was never a beat.
 */
export function collectTap(taps: readonly number[], at: number): number[] {
  const last = taps[taps.length - 1]
  if (last === undefined || at - last > TAP_TIMEOUT_S || at < last) return [at]
  return [...taps, at].slice(-MAX_TAPS)
}

/**
 * The tempo a set of taps describes, or nothing while there is still only one.
 *
 * The middle gap rather than the average: a hand that fumbles one tap should
 * not drag the tempo with it, and the median simply ignores it.
 */
export function tempoFromTaps(taps: readonly number[]): number | null {
  if (taps.length < 2) return null
  const gaps = taps.slice(1).map((tap, index) => tap - (taps[index] as number))
  return Math.round(clampBpm(SECONDS_PER_MINUTE / median(gaps)))
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return (((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2)
}
