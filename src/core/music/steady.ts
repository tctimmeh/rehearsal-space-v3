/**
 * What the needle is showing, and what the tuner believes.
 *
 * A plucked string is sharp at the moment it is struck and settles as it dies
 * away — real physics, not a fault of the detector. A needle that follows
 * every reading therefore swings flat across the life of every note, which is
 * no use: a tuner is read after the attack, and what it is wanted for is the
 * pitch the string settles on.
 *
 * So belief and display are separate. A pitch is believed only after a run of
 * readings has stayed tight for half a second, which the slide of an attack
 * never manages; the needle then eases to whatever is believed. Replucking the
 * same string says nothing new and moves nothing. Turning a peg establishes a
 * new pitch and is followed. A single window hearing an octave is a mistake
 * rather than a new string, and says the same.
 */
export interface Needle {
  /** What is shown, or null before anything has been believed. */
  hz: number | null
  /** What the tuner has settled on. */
  believed: number | null
  /** Where the run of readings under consideration began. */
  anchor: number | null
  /** How many readings have stayed near that anchor. */
  agreed: number
}

/** How tight a run has to stay to count as one pitch rather than a slide. */
const RUN_CENTS = 1.5
/** Readings at twenty a second, so ten of them is half a second. */
const STEADY_READINGS = 10
/** How far the needle moves toward what is believed, each reading. */
const EASE = 0.35

export const newNeedle = (): Needle => ({
  hz: null,
  believed: null,
  anchor: null,
  agreed: 0
})

const centsBetween = (from: number, to: number): number => 1200 * Math.log2(to / from)

export function moveNeedle(needle: Needle, reading: number): Needle {
  if (reading <= 0) return needle

  const holding =
    needle.anchor !== null && Math.abs(centsBetween(needle.anchor, reading)) <= RUN_CENTS
  const agreed = holding ? needle.agreed + 1 : 1
  const settled = agreed >= STEADY_READINGS

  const believed = settled ? reading : needle.believed
  const anchor = settled ? null : holding ? needle.anchor : reading

  return {
    hz: eased(needle.hz, believed),
    believed,
    anchor,
    agreed: settled ? 0 : agreed
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
