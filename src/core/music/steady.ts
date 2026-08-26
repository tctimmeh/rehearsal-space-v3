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
}

/**
 * Readings arrive twenty a second, so the window is a little over a second and
 * its halves are six tenths apart.
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
const SCATTER_CENTS = 4
/**
 * How long the tuner will go without believing anything before it believes the
 * middle of the window regardless — two seconds.
 *
 * Nothing should leave a tuner blank in front of somebody holding an
 * instrument, and nothing should leave it stuck on a reading it took a moment
 * ago either. Whatever a real room does to the readings, this puts a floor
 * under how out of date the needle can be; a note that settles normally never
 * reaches it.
 */
const PATIENCE = 40
/** How far the needle moves toward what is believed, each reading. */
const EASE = 0.35

export const newNeedle = (): Needle => ({ hz: null, believed: null, recent: [], waiting: 0 })

const centsBetween = (from: number, to: number): number => 1200 * Math.log2(to / from)

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((one, other) => one - other)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  return ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export function moveNeedle(needle: Needle, reading: number): Needle {
  if (reading <= 0) return needle

  const recent = [...needle.recent, reading].slice(-WINDOW)
  const waiting = needle.waiting + 1

  if (recent.length < WINDOW) return { ...needle, recent, waiting }

  const half = Math.floor(WINDOW / 2)
  const older = median(recent.slice(0, half))
  const newer = median(recent.slice(half))
  const middle = median(recent)
  const scatter = median(recent.map((heard) => Math.abs(centsBetween(middle, heard))))

  const settled =
    scatter <= SCATTER_CENTS && Math.abs(centsBetween(older, newer)) <= SETTLED_CENTS

  /* The middle of the window rather than the latest reading: one wild window
     is a mistake, and the middle never counts it. */
  const believed = settled || waiting >= PATIENCE ? middle : needle.believed
  const moved = believed !== needle.believed

  return {
    hz: eased(needle.hz, believed),
    believed,
    recent,
    waiting: moved ? 0 : waiting
  }
}

/** The needle moves toward what is believed rather than arriving on it. */
function eased(shown: number | null, believed: number | null): number | null {
  if (believed === null) return shown
  if (shown === null) return believed
  const away = centsBetween(shown, believed)
  if (Math.abs(away) < 0.05) return believed
  return shown * 2 ** ((away * EASE) / 1200)
}
