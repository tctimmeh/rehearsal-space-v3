/**
 * What the needle shows.
 *
 * The detector is better than it has any right to be. Measured against an
 * offline analysis of thirty-four recordings of a real guitar — big windows,
 * no deadline, the luxury of hindsight — its readings sit a tenth of a cent
 * from the truth and move seven hundredths of a cent from one reading to the
 * next, and it never once named the wrong octave. So almost nothing is done to
 * them: the ones the detector was unsure of are dropped, and the middle of the
 * last handful is shown.
 *
 * Two earlier versions of this file did a great deal more, because they were
 * built against a synthetic string that turned out to be some forty times
 * noisier than a real one. Everything they did to survive that invention made
 * the needle worse on an actual guitar — ten to twenty cents behind a turning
 * peg, and frozen on a held one, reading in tune while the string sat three
 * cents flat.
 *
 * The last of it to go was a wait. A plucked string really is sharp when
 * struck — ten cents on a low E, settling as it fades — and waiting for it to
 * fade before believing it does measurably improve the reading in the second
 * after a pluck. It also costs a second and a half of watching "listening…"
 * before being told what you just played, and that turned out to be the thing
 * that mattered when the tuner met a guitar and a person tuning it. So the
 * needle answers, and corrects itself as the note settles, which is what a
 * tuner being used rather than measured wants.
 */
export interface Needle {
  /** What is shown, or null before anything has been heard. */
  hz: number | null
  /** The readings being averaged, oldest first. */
  recent: number[]
}

/**
 * The two numbers worth arguing about. They are settings rather than constants
 * because what they trade against each other — how quickly the needle answers
 * against how still it sits — is a matter of taste, and taste needs a guitar
 * in your hands rather than a measurement.
 */
export interface NeedleSettings {
  /** How many readings the needle shows the middle of. */
  readings: number
  /**
   * How periodic a window must have been for its reading to count.
   *
   * A strummed chord is what this is for. Six strings at once are not periodic
   * and are refused outright nine windows in ten, but the odd one comes out
   * looking convincing — and what it reads is not any of the six strings, it
   * is nonsense a hundred cents from the nearest. Being stricter rules those
   * out; being laxer names a string you have just played sooner. The default
   * leans towards sooner, which is the way round it was wanted by the person
   * holding the guitar.
   */
  clarity: number
}

/** Settled by playing at it: six hundredths of a second's worth of readings. */
export const DEFAULT_NEEDLE: NeedleSettings = { readings: 12, clarity: 0.85 }

export interface Heard {
  frequency: number | null
  /** Zero to one. How periodic the window actually was. */
  clarity: number
  level: number
}

export const newNeedle = (): Needle => ({ hz: null, recent: [] })

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((one, other) => one - other)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export function moveNeedle(
  needle: Needle,
  heard: Heard,
  settings: NeedleSettings = DEFAULT_NEEDLE
): Needle {
  if (heard.frequency === null || heard.clarity < settings.clarity) return needle

  const recent = [...needle.recent, heard.frequency].slice(-settings.readings)
  return { hz: median(recent), recent }
}
