/**
 * A fader's travel is in decibels, not in amplitude, so equal movement gives
 * equal change in loudness wherever the fader happens to be.
 *
 * The range is deliberately short. Balancing one part against another happens
 * within about 15 dB, and a strip is only a few dozen pixels tall — spread a
 * console's 50 or 60 dB across that and everything useful is squeezed into the
 * top few pixels, with the rest of the fader covering degrees of inaudible.
 * Below this floor there is nothing worth distinguishing, so the fader is off.
 *
 * Top of travel is unity — faders attenuate, they do not boost.
 */
const MIN_DB = -20

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Fader position (0 at the bottom, 1 at the top) to a gain multiplier. */
export function faderToGain(position: number): number {
  const travel = clamp01(position)
  /* The bottom of the fader is off, not merely very quiet. */
  if (travel <= 0) return 0
  return 10 ** ((MIN_DB * (1 - travel)) / 20)
}

/** The inverse: where a given gain sits on the fader. */
export function gainToFader(gain: number): number {
  const level = clamp01(gain)
  if (level <= 0) return 0
  const db = 20 * Math.log10(level)
  return db <= MIN_DB ? 0 : 1 - db / MIN_DB
}

/** Silence has no decibel value, so it gets the symbol for one. */
export function gainToDb(gain: number): string {
  if (gain <= 0.0001) return '−∞ dB'
  return `${(20 * Math.log10(gain)).toFixed(1).replace('-', '−')} dB`
}
