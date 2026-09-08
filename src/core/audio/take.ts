import { takeSemitones } from '../mix/pitch'
import type { PitchOffset } from '../song/song'

export interface TakeCorrection {
  /** What to shift it by, to undo the pitch it was played against. */
  semitones: number
  /** How fast to read it, to undo the tempo it was played against. */
  rate: number
}

export interface TakePlacement {
  /** Song time the clock read at the moment the first sample was captured. */
  songTimeAtFirstSample: number
  /** How far behind the playhead the sound a player is following actually is. */
  audibleDelay: number
  /** How long the input took to hand over what it heard. */
  inputLatency: number
  /** Playback rate, since song time runs faster or slower than the room does. */
  speed: number
  /** Earliest point on the timeline. A take cannot begin before the song does. */
  earliest: number
}

export interface TakePlacing {
  startTime: number
  /** Seconds of audio to drop from the head before the take is kept. */
  trimSeconds: number
}

/**
 * Where a take belongs on the timeline, and what of it is worth keeping.
 *
 * Not where the clock was when it was captured: a player follows what they
 * hear, which left the graph a moment before, and what they play takes another
 * moment to come back in. Both delays put the performance earlier in the song
 * than the timestamp on it suggests, and both are measured in real seconds —
 * so at 80% speed they cover less song than they do at full.
 *
 * Recording from the top is the case that makes this visible. The whole take
 * wants to sit a fifth of a second before 00:00, and clamping it to 00:00
 * instead — which is what the app used to do — leaves every note that late.
 * What belongs before the start is a fifth of a second of a room with nothing
 * audible in it yet, so it is dropped and the rest keeps its timing.
 */
export function placeTake({
  songTimeAtFirstSample,
  audibleDelay,
  inputLatency,
  speed,
  earliest
}: TakePlacement): TakePlacing {
  const roundTrip = (audibleDelay + inputLatency) * speed
  const wanted = songTimeAtFirstSample - roundTrip
  if (wanted >= earliest) return { startTime: wanted, trimSeconds: 0 }
  return { startTime: earliest, trimSeconds: (earliest - wanted) / speed }
}

/** Drops the head of a take, in the take's own seconds. */
export function trimHead(
  channels: readonly Float32Array[],
  seconds: number,
  sampleRate: number
): Float32Array[] {
  const samples = Math.round(seconds * sampleRate)
  if (samples <= 0) return [...channels]
  return channels.map((channel) =>
    samples >= channel.length ? new Float32Array(0) : channel.subarray(samples)
  )
}

/**
 * How much slower a take has to be played to sit in the song's own time.
 *
 * A take is performed against the song as it was running, so a take played
 * against a song at 150% is a performance of a song going half again as fast.
 * The audio arrives in the room's seconds; the song's channels are all kept in
 * the song's own, and are resampled to whatever the tempo knob says on the way
 * out. Left as it arrived a take meets that resampling a second time — once in
 * the playing, once in the playback — and runs away from the music it was
 * played to, further with every bar.
 *
 * So it is stretched by exactly what the song was sped up by, which is the
 * time half of what `takeSemitones` does for pitch. Stretched rather than
 * resampled: resampling would drag the pitch along with it, and the pitch has
 * already been dealt with.
 *
 * The number is what the stretcher wants — how fast to read the take — so it
 * is the reciprocal: a take recorded at 150% is read at two thirds speed, and
 * comes out half again as long.
 */
export const takeRate = (speed: number): number =>
  Number.isFinite(speed) && speed > 0 ? 1 / speed : 1

/**
 * Everything the song was doing to the player's ears, ready to be undone.
 *
 * The two halves are one thing and are returned as one, because for a while
 * only the pitch half existed: a take recorded at 150% was corrected for a key
 * change it never had and left running half again too fast, which is not an
 * offset but a drift, and shows up as singing that comes in early and gets
 * earlier.
 */
export const takeCorrection = (heardAt: { pitch: PitchOffset; speed: number }): TakeCorrection => ({
  semitones: takeSemitones(heardAt.pitch),
  rate: takeRate(heardAt.speed)
})
