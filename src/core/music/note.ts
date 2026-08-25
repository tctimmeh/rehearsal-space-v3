/** Concert pitch. Everything here is reckoned from it. */
export const A4_HZ = 440
const A4_MIDI = 69
const SEMITONES = 12
const CENTS_PER_SEMITONE = 100

/** Near enough that nobody can hear the difference on a strummed chord. */
export const IN_TUNE_CENTS = 5

const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const

export interface NoteReading {
  /** MIDI number of the nearest note. */
  midi: number
  /** Its name, without the octave: "A", "C♯". */
  name: string
  octave: number
  /** How far the sound is from that note, negative for flat. */
  cents: number
  /** What the note would be if it were in tune. */
  idealHz: number
}

export const midiToFrequency = (midi: number, a4 = A4_HZ): number =>
  a4 * 2 ** ((midi - A4_MIDI) / SEMITONES)

/**
 * The note a frequency is nearest, and how far off it is.
 *
 * Cents rather than hertz because a hertz means something different at every
 * pitch: five hertz flat is a shrug on the top string and a different note
 * near the bottom of a bass.
 */
export function noteFromFrequency(hz: number, a4 = A4_HZ): NoteReading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null

  const exact = A4_MIDI + SEMITONES * Math.log2(hz / a4)
  const midi = Math.round(exact)
  const name = NAMES[((midi % SEMITONES) + SEMITONES) % SEMITONES] as string

  return {
    midi,
    name,
    /* Octaves turn over at C, which is why this is not simply a division. */
    octave: Math.floor(midi / SEMITONES) - 1,
    cents: (exact - midi) * CENTS_PER_SEMITONE,
    idealHz: midiToFrequency(midi, a4)
  }
}

export const isInTune = (cents: number): boolean => Math.abs(cents) <= IN_TUNE_CENTS
