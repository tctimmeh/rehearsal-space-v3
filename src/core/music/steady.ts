/**
 * What the needle shows.
 *
 * The detector is better than it has any right to be. Measured against an
 * offline analysis of real guitar recordings — big windows, no deadline, the
 * luxury of hindsight — its readings sit a tenth of a cent from the truth and
 * move seven hundredths of a cent from one reading to the next, and across
 * nine recordings of three strings it never once named the wrong octave. Very
 * little has to be done to it, and an earlier version of this file did a great
 * deal: a window of two dozen readings, its halves compared, its scatter
 * measured, a deadband, a patience, a way of chasing a moving string. All of
 * it was defending against noise that a real guitar does not produce, and the
 * cost was a needle that sat ten to twenty cents behind a turning peg and
 * froze solid on a held one — reading in tune while the string was three cents
 * flat.
 *
 * So the readings are taken at face value, and only two things are done.
 *
 * The detector says how periodic each window actually was, and the readings it
 * is least sure of are the ones that are wrong: below nine tenths, the typical
 * reading is out by five cents instead of a fifth of one. Those are dropped.
 *
 * The other is the one thing a plucked string really does do. It is sharp when
 * struck and settles as it dies away — ten cents on a low E, four on a B, most
 * of it gone within a second. That is the string, not the detector, and a
 * tuner that shows it is honest and useless: what is wanted is the pitch the
 * string is settling on. Sharpness and loudness fade together, being the same
 * fact about a decaying string, so the pitch is read once the note has fallen
 * to a fraction of its own loudest — which needs no notion of how hard this
 * player plucks or which string this is. Waiting that long costs nothing,
 * because a peg being turned is not an attack and is followed the moment it
 * moves.
 */
export interface Needle {
  /** What is shown, or null before anything has been heard. */
  hz: number | null
  /** The readings being averaged, oldest first. */
  recent: number[]
  /** The loudest the note being listened to has been. */
  peak: number
  /** Readings since that note was struck. */
  since: number
  /** The level of the previous reading, which is how a new note is noticed. */
  wasAt: number
}

/**
 * The four numbers worth arguing about, and one choice.
 *
 * They are settings rather than constants because what they trade against
 * each other — how quickly the needle answers against how still it sits — is
 * a matter of taste that can only be settled with a guitar in your hands.
 */
export interface NeedleSettings {
  /** How many readings the needle shows the middle of. */
  readings: number
  /**
   * How periodic a window must have been for its reading to count.
   *
   * A strummed chord is what this is really for. Six strings at once are not
   * periodic and are refused outright nine windows in ten, but the odd one
   * comes out looking convincing — and what it reads is not any of the six
   * strings, it is nonsense a hundred cents from the nearest.
   */
  clarity: number
  /** How far a note must fall from its own loudest before it is read. */
  settledShare: number
  /** How long a note that never falls that far is waited on, in readings. */
  grace: number
  /**
   * Whether to skip that wait when there is nothing on screen at all.
   *
   * The wait is there to stop a fresh pluck dragging a good reading sharp. If
   * there is no reading to drag, it buys nothing, and it costs the second and
   * a half between striking a string and being told what it is.
   */
  answerFast: boolean
}

export const DEFAULT_NEEDLE: NeedleSettings = {
  readings: 5,
  clarity: 0.95,
  settledShare: 0.45,
  grace: 24,
  answerFast: true
}

/**
 * Loud enough, and enough louder than a moment ago, to be a fresh note.
 *
 * A quiet pluck never reaches this and so is never waited on — which is the
 * right answer rather than a hole in it, since a string struck gently is a
 * string barely bent sharp. The waiting matters in proportion to how hard the
 * string was hit, and so does the noticing.
 */
const ONSET_LEVEL = 0.01
const ONSET_RISE = 1.8
/** Readings for which a note holds its peak, and the fewest between notes. */
const STRUCK = 3
const APART = 20

export interface Heard {
  frequency: number | null
  /** Zero to one. How periodic the window actually was. */
  clarity: number
  level: number
}

export const newNeedle = (): Needle => ({
  hz: null,
  recent: [],
  peak: 0,
  since: APART,
  wasAt: 0
})

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
  const struck = heard.level > ONSET_LEVEL && heard.level > needle.wasAt * ONSET_RISE

  const note = struck && needle.since >= APART ? fresh(heard) : carryOn(needle, heard)
  const nothingToLose = settings.answerFast && needle.hz === null
  const worth =
    heard.frequency !== null &&
    heard.clarity >= settings.clarity &&
    (nothingToLose || hasSettled(note, heard.level, settings))

  if (!worth) return { ...note, hz: needle.hz, recent: needle.recent, wasAt: heard.level }

  const recent = [...needle.recent, heard.frequency as number].slice(-settings.readings)
  return { ...note, hz: median(recent), recent, wasAt: heard.level }
}

/**
 * Whether the pitch of the note being listened to is worth reading yet: it has
 * died away far enough for the sharpness of the attack to have gone, or it has
 * gone on so long that it plainly is not going to, or it was never heard being
 * struck at all and so has no attack to wait out.
 */
const hasSettled = (
  note: { peak: number; since: number },
  level: number,
  settings: NeedleSettings
): boolean =>
  note.peak === 0 || level <= note.peak * settings.settledShare || note.since >= settings.grace

const fresh = (heard: Heard) => ({ peak: heard.level, since: 0 })

/** A note holds the loudest it was in the moment it was struck. */
const carryOn = (needle: Needle, heard: Heard) => ({
  peak: needle.since < STRUCK ? Math.max(needle.peak, heard.level) : needle.peak,
  since: needle.since + 1
})
