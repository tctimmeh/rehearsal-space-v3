import { solveMetronome } from '../metronome/solve'
import type { Song } from './song'

/**
 * The stretch of time the song occupies, which is not the same as its length.
 *
 * It can begin before zero, and usually does when there is a count-in: the
 * clicks come *before* the music, so the timeline has to reach back far enough
 * to include them or they can never be heard.
 *
 * A metronome channel is anchored at its end, so where it starts has to be
 * solved rather than read — that is the whole point of it.
 */
export function songBounds(song: Song): [start: number, end: number] {
  let start = 0
  let end = 0

  for (const channel of song.channels) {
    if (channel.kind === 'audio') {
      start = Math.min(start, channel.startTime)
      end = Math.max(end, channel.startTime + channel.duration)
    } else {
      const timing = solveMetronome(channel)
      start = Math.min(start, timing.startTime)
      end = Math.max(end, timing.endTime)
    }
  }

  return [start, end]
}
