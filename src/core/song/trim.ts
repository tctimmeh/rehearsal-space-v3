import type { AudioChannel } from './song'

/**
 * Which part of a channel's file is played, and where it sits in the song.
 *
 * Trimming takes nothing away from the file. It moves the two ends of the part
 * that is kept, so anything cut off is still there and can be let back in —
 * which matters, because the ends of a take are exactly where somebody
 * discovers they cut off the first note.
 */

/**
 * How long the file is, whether or not the channel says so.
 *
 * A channel written before trimming existed does not say, and does not need
 * to: it plays all of its file, so the file is as long as it plays for.
 */
export const sourceLength = (channel: AudioChannel): number =>
  channel.sourceDuration ?? (channel.offset ?? 0) + channel.duration

/** Where the kept part begins and ends within the file. */
export const keptPart = (channel: AudioChannel): { from: number; to: number } => {
  const from = channel.offset ?? 0
  return { from, to: from + channel.duration }
}

/** The shortest a channel can be trimmed to, so it cannot vanish. */
export const LEAST_KEPT = 0.05

/**
 * Keeps a different part of the file, without moving the music.
 *
 * Trimming the front of a take should not drag what is left of it earlier:
 * the notes are where they are, and the whole point of cutting off a count-in
 * or a false start is that the rest stays put. So the timeline position moves
 * by however much the beginning moved.
 */
export function keepPart(channel: AudioChannel, from: number, to: number): AudioChannel {
  const whole = sourceLength(channel)
  const begins = Math.min(Math.max(0, from), whole - LEAST_KEPT)
  const ends = Math.max(begins + LEAST_KEPT, Math.min(to, whole))
  const was = channel.offset ?? 0

  return {
    ...channel,
    offset: begins,
    sourceDuration: whole,
    startTime: channel.startTime + (begins - was),
    duration: ends - begins
  }
}

/** Where in the song the kept part starts, the music moving with it. */
export const startAt = (channel: AudioChannel, startTime: number): AudioChannel => ({
  ...channel,
  startTime
})

/** Everything the file has, back again, right where it was played from. */
export const keepAll = (channel: AudioChannel): AudioChannel =>
  keepPart(channel, 0, sourceLength(channel))

/**
 * What to play, and when, for a channel reached at a given moment in the song.
 *
 * Kept here rather than in the engine because it is arithmetic and nothing
 * else, and because getting it wrong is inaudible until somebody plays the
 * song from the middle: the offset into the file and the offset into the
 * channel are different numbers, and only one of them moves when a take is
 * trimmed.
 */
export function playFrom(
  channel: AudioChannel,
  songTime: number
): { wait: number; from: number; length: number } | null {
  const ends = channel.startTime + channel.duration
  if (songTime >= ends) return null

  const begins = channel.offset ?? 0
  if (songTime <= channel.startTime) {
    return { wait: channel.startTime - songTime, from: begins, length: channel.duration }
  }

  const into = songTime - channel.startTime
  return { wait: 0, from: begins + into, length: channel.duration - into }
}
