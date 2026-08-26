/**
 * What the needle is showing, and what the tuner believes.
 *
 * A plucked string is sharp at the moment it is struck and settles as it dies
 * away — real physics, not a fault of the detector. A needle that follows
 * every reading therefore swings flat across the life of every note, which is
 * no use: a tuner is read after the attack, and what it is wanted for is the
 * pitch the string settles on.
 *
 * So the tuner waits for a pitch worth believing, and two things have to hold
 * before it believes one. The two halves of the window must agree, which a
 * note still sliding into tune never does. And the readings must be consistent
 * among themselves, which the moment of a pluck never is — the attack is not a
 * tidy slide but a mess, the detector throwing out anything from a semitone
 * sharp to a semitone flat while the note finds itself, and those wild
 * readings sit either side of the truth, so the halves of the window agree
 * perfectly well while the note is still miles out. Only their scatter gives
 * it away. Each test catches what the other misses.
 *
 * None of that is any use for following a peg, though, because the whole point
 * of it is to wait. So a reading far from what is believed is not treated as
 * noise at all: a few of those in a row is a hand on a tuning peg, and the
 * tuner drops what it believed and starts again from them. Waiting is for
 * deciding what a string settled on; it has no business slowing down the
 * answer to a string that plainly moved.
 *
 * What neither may do is ask for more agreement than real readings ever offer.
 * They scatter by a few cents however steady the string is — vibrato, the
 * room, the detector's own arithmetic — and an earlier attempt at this asked
 * them to agree closely, which they never did, so nothing was ever believed
 * and the needle sat blank in front of somebody holding a guitar.
 */
export interface Needle {
  /** What is shown, or null before anything has been believed. */
  hz: number | null
  /** What the tuner has settled on. */
  believed: number | null
  /** The readings under consideration, oldest first. */
  recent: number[]
  /** Readings since anything was last believed. */
  waiting: number
  /** True while a string is being wound and the needle is following it live. */
  chasing: boolean
}

/**
 * Readings arrive twenty a second, so the window is a little over a second
 * long and its halves six tenths apart.
 *
 * The length matters more than it looks. A decaying pluck loses its sharpness
 * and its speed together — it is always about half a second from settling — so
 * how sharp it still is when the two halves agree depends on how far apart in
 * time they are. Half a second apart, the note is believed while it is still
 * the better part of a semitone sharp; this far apart, within a couple of
 * cents.
 */
const WINDOW = 24
/** How far the two halves may disagree and still count as one pitch. */
const SETTLED_CENTS = 2.5
/**
 * How much the readings may scatter about their middle. Wide enough for the
 * few cents a real string and a real detector always disagree by, narrow
 * enough to rule out the moment of a pluck.
 */
const SCATTER_CENTS = 2.5
/**
 * How long the tuner will go without believing anything before it believes the
 * middle of the window regardless — three seconds.
 *
 * Nothing should leave a tuner blank in front of somebody holding an
 * instrument, and nothing should leave it stuck on a reading it took a moment
 * ago either. Whatever a real room does to the readings, this puts a floor
 * under how out of date the needle can be; a note that settles normally never
 * reaches it. It has to stay comfortably longer than the window, or it fires
 * on windows that were still filling and hands the needle the very mess the
 * window exists to reject.
 */
const PATIENCE = 60
/**
 * How far from what is believed a reading has to be before it is taken as
 * movement rather than scatter, and how many such readings in a row — a fifth
 * of a second — count as a hand on a peg.
 *
 * Noticing the hand is only half of it. Once a string is known to be moving,
 * waiting has nothing left to offer: the needle follows the middle of the last
 * few readings live, the way a tuner does under your hands, until the string
 * arrives somewhere and the careful business of settling takes over again.
 *
 * They must also hold together, which is what tells a peg from the chaos of a
 * pluck: winding a string is orderly even when it is quick, while an attack
 * throws readings a long way out in both directions at once. The allowance is
 * loose on purpose — it is there to rule out chaos, and a wind fast enough to
 * exceed it is not a thing hands do.
 */
const MOVEMENT_CENTS = 20
const MOVEMENT_READINGS = 4
const MOVEMENT_SPREAD_CENTS = 20
/**
 * How much a newly settled pitch must differ from the believed one to replace
 * it. Below this the string has not really changed, and moving the needle for
 * it only makes it restless.
 *
 * Wider than it looks like it should be, because the detector's own reading of
 * a perfectly steady string wanders by a few cents from window to window.
 * Measured against a string held at one pitch, this is the difference between
 * a needle that never moves at all and one that fidgets by a couple of cents —
 * and
 * because it also stops the needle chasing the odd bad window, it ends up
 * nearer the truth rather than further from it.
 */
const DEADBAND_CENTS = 2.5
/** How many readings the needle follows the middle of while a string moves. */
const FOLLOWING = 3
/** How little a string can move between those and still count as arrived. */
const STILL_CENTS = 1.5
/** How far the needle moves toward what is believed, each reading. */
const EASE = 0.35

export const newNeedle = (): Needle => ({
  hz: null,
  believed: null,
  recent: [],
  waiting: 0,
  chasing: false
})

const centsBetween = (from: number, to: number): number => 1200 * Math.log2(to / from)

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((one, other) => one - other)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export function moveNeedle(needle: Needle, reading: number): Needle {
  if (reading <= 0) return needle

  const moving = [...needle.recent, reading].slice(-MOVEMENT_READINGS)
  if (hasMovedOn(needle.believed, moving)) return follow(needle, moving)

  const recent = [...needle.recent, reading].slice(-WINDOW)
  const waiting = needle.waiting + 1

  if (needle.chasing && stillMoving(recent)) return follow(needle, recent)

  /* A filling window decides nothing, but the needle still has somewhere to
     be: whatever was last believed, which it should be gliding toward rather
     than sitting frozen until the window is full again. */
  if (recent.length < WINDOW) {
    return { ...needle, hz: eased(needle.hz, needle.believed), recent, waiting, chasing: false }
  }

  const half = Math.floor(WINDOW / 2)
  const older = median(recent.slice(0, half))
  const newer = median(recent.slice(half))
  const middle = median(recent)
  const scatter = median(recent.map((heard) => Math.abs(centsBetween(middle, heard))))

  const settled =
    scatter <= SCATTER_CENTS && Math.abs(centsBetween(older, newer)) <= SETTLED_CENTS

  /* The middle of the window rather than the latest reading: one wild window
     is a mistake, and the middle never counts it. */
  const believing = settled || waiting >= PATIENCE
  const believed = believing ? worthMoving(needle.believed, middle) : needle.believed

  /* Holding a settled pitch because the change was too small to bother with is
     still the tuner being up to date, so it does not spend the patience. */
  return {
    hz: eased(needle.hz, believed),
    believed,
    recent,
    waiting: believing ? 0 : waiting,
    chasing: false
  }
}

/** Follows the middle of the last few readings, with no waiting about. */
function follow(needle: Needle, recent: readonly number[]): Needle {
  const now = median(recent.slice(-FOLLOWING))
  return { hz: eased(needle.hz, now), believed: now, recent: [...recent], waiting: 0, chasing: true }
}

/** Whether a string being followed is still on its way somewhere. */
function stillMoving(recent: readonly number[]): boolean {
  if (recent.length < FOLLOWING * 2) return true
  const now = median(recent.slice(-FOLLOWING))
  const before = median(recent.slice(-FOLLOWING * 2, -FOLLOWING))
  return Math.abs(centsBetween(before, now)) >= STILL_CENTS
}

/** A hand on a peg: every recent reading well to one side of what is believed. */
function hasMovedOn(believed: number | null, readings: readonly number[]): boolean {
  if (believed === null || readings.length < MOVEMENT_READINGS) return false
  const away = readings.map((heard) => centsBetween(believed, heard))
  const together = Math.abs(centsBetween(Math.min(...readings), Math.max(...readings)))
  if (together > MOVEMENT_SPREAD_CENTS) return false
  return away.every((cents) => cents > MOVEMENT_CENTS) || away.every((cents) => cents < -MOVEMENT_CENTS)
}

/** Small differences are the string being itself, not the string changing. */
const worthMoving = (believed: number | null, settled: number): number =>
  believed !== null && Math.abs(centsBetween(believed, settled)) < DEADBAND_CENTS ? believed : settled

/** The needle moves toward what is believed rather than arriving on it. */
function eased(shown: number | null, believed: number | null): number | null {
  if (believed === null) return shown
  if (shown === null) return believed
  const away = centsBetween(shown, believed)
  if (Math.abs(away) < 0.05) return believed
  return shown * 2 ** ((away * EASE) / 1200)
}
