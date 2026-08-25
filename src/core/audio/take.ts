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
