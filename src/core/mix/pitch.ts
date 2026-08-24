import type { PitchOffset } from '../song/song'

/** Semitones per octave, which is what a doubling of playback rate amounts to. */
const SEMITONES_PER_OCTAVE = 12

/** The user's pitch offset as a single number of semitones. */
export const requestedSemitones = (pitch: PitchOffset): number =>
  pitch.semitones + pitch.cents / 100

/**
 * What the shifter on the Music bus has to be set to.
 *
 * Tempo is changed by resampling — playing the audio faster or slower — which
 * drags the pitch along with it: at 80% speed everything sounds a minor third
 * low. The shifter undoes exactly that, and applies whatever the user actually
 * asked for on top. So the two controls come out independent even though one
 * of them is a side effect of the other.
 */
export const shifterSemitones = (speed: number, pitch: PitchOffset): number =>
  requestedSemitones(pitch) - SEMITONES_PER_OCTAVE * Math.log2(speed)

/** Neutral means the shifter can be taken out of the path altogether. */
export const isShiftNeutral = (speed: number, pitch: PitchOffset): boolean =>
  Math.abs(shifterSemitones(speed, pitch)) < 0.001
