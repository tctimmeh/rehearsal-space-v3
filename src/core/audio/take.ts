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

/**
 * Where a take belongs on the timeline.
 *
 * Not where the clock was when it was captured: a player follows what they
 * hear, which left the graph a moment before, and what they play takes another
 * moment to come back in. Both delays put the performance earlier in the song
 * than the timestamp on it suggests, and both are measured in real seconds —
 * so at 80% speed they cover less song than they do at full.
 */
export function takeStartTime({
  songTimeAtFirstSample,
  audibleDelay,
  inputLatency,
  speed,
  earliest
}: TakePlacement): number {
  const roundTrip = (audibleDelay + inputLatency) * speed
  return Math.max(earliest, songTimeAtFirstSample - roundTrip)
}
