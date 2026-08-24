import type { Channel } from '../song/song'

/**
 * Whether a channel should be heard, given the state of every other channel.
 *
 * Two rules from the spec, and the order between them is the whole point:
 * solo restricts playback to the soloed channels, and mute wins over solo even
 * on a channel that is itself soloed.
 */
export function isAudible(channel: Channel, channels: readonly Channel[]): boolean {
  if (channel.muted) return false
  return !anySoloed(channels) || channel.soloed
}

/** Metronome channels cannot be soloed, so they never put the mix into solo. */
export const anySoloed = (channels: readonly Channel[]): boolean =>
  channels.some((channel) => channel.soloed && channel.kind !== 'metronome')

/** The gain a channel contributes: its fader, or nothing at all. */
export const audibleGain = (channel: Channel, channels: readonly Channel[]): number =>
  isAudible(channel, channels) ? channel.gain : 0
