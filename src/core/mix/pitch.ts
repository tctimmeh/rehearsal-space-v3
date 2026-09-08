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

/**
 * What a take has to be shifted by on its way into the song.
 *
 * A take is played against what the shifter is already doing: if the song in
 * the player's ears is a tone up, what they play is a tone up too. Coming back
 * it meets that same shifter, which would raise it a second time. So it is
 * lowered on the way in by exactly what the song was raised by, and the two
 * cancel — leaving a channel that sits in the song's own key and follows the
 * pitch knob afterwards like every other channel does.
 *
 * Tempo does not come into it *here*. Playing a buffer faster raises its pitch
 * and the shifter takes that back off again, so what a take is out by in pitch
 * is only ever what the user actually asked for. What tempo does to a take is
 * done to its length instead, and `takeRate` is the other half of this.
 */
export const takeSemitones = (pitch: PitchOffset): number => -requestedSemitones(pitch)
