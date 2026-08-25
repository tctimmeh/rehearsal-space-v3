/**
 * Where a meter stops reading. A signal below this is quieter than the noise
 * of the room it was recorded in, so showing it would only ever be mistaken
 * for something arriving.
 */
export const METER_FLOOR_DB = -60

/** Full scale, where a converter has nothing left to give and clips. */
const FULL_SCALE = 1

export function amplitudeToDb(amplitude: number): number {
  const magnitude = Math.abs(amplitude)
  return magnitude <= 0 ? Number.NEGATIVE_INFINITY : 20 * Math.log10(magnitude)
}

/**
 * How far up the meter an amplitude sits, 0 at the floor and 1 at full scale.
 *
 * Decibels, not amplitude: a level meter drawn linearly spends nearly all of
 * its travel in the top few decibels and reads as dead for everything a guitar
 * actually does.
 */
export function meterFraction(amplitude: number): number {
  const db = amplitudeToDb(amplitude)
  if (db <= METER_FLOOR_DB) return 0
  return Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB)
}

export function isClipping(amplitude: number): boolean {
  return Math.abs(amplitude) >= FULL_SCALE
}

/** Anything at all, as opposed to a device that is open but delivering nothing. */
export function isAudible(amplitude: number): boolean {
  return amplitudeToDb(amplitude) > METER_FLOOR_DB
}

const DECAY_DB_PER_SECOND = 30

/**
 * A meter rises the instant sound arrives and falls slowly afterwards.
 *
 * Falling at the speed of the signal would leave it flickering between silence
 * and the peaks of each cycle, which reads as a fault rather than as a level.
 */
export function decayedLevel(previous: number, measured: number, seconds: number): number {
  if (measured >= previous) return measured
  const decayed = previous * 10 ** ((-DECAY_DB_PER_SECOND * Math.max(0, seconds)) / 20)
  return Math.max(measured, decayed)
}
