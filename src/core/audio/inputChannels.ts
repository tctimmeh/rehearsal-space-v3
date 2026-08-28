/** 0 means take the device as it comes; otherwise the 1-based channel to keep. */
export type InputChoice = number

export const ALL_INPUTS: InputChoice = 0

/**
 * Narrows a capture to the input the user actually plugged something into.
 *
 * An interface with two sockets arrives as one stereo device: a guitar in the
 * first and a microphone in the second are the left and right of the same
 * stream, not two devices. Recording that as stereo would give a take with the
 * guitar hard left and the voice hard right, which is nobody's intention — so
 * one input is picked and the take is mono.
 */
export function pickInput(
  channels: readonly Float32Array[],
  choice: InputChoice
): Float32Array[] {
  if (channels.length === 0) return []
  if (choice === ALL_INPUTS) return [...channels]

  /* Asking for an input the device does not have is better answered with the
     first one than with silence the user would have to diagnose. */
  const wanted = channels[choice - 1] ?? channels[0]
  return wanted === undefined ? [] : [wanted]
}

/**
 * How much quieter than the loudest input a socket must be before it counts as
 * empty, and how quiet it must be in its own right. Both have to hold: a take
 * where one part is simply far louder than the other is still a take of two
 * things, and a quiet room down a live microphone is still a performance.
 */
const BESIDE_THE_LOUDEST = 0.032 /* about 30 dB below it */
const QUIET_IN_ITSELF = 0.0018 /* about -55 dBFS */

const peakOf = (channel: Float32Array): number => {
  let loudest = 0
  for (const sample of channel) {
    const size = Math.abs(sample)
    if (size > loudest) loudest = size
  }
  return loudest
}

/**
 * Which inputs had something plugged into them.
 *
 * An empty socket is judged against the ones beside it rather than against a
 * number, because what an unused input reads depends on the interface and on
 * whether its preamp is even live — a muted microphone gives near silence, an
 * open one gives a room. Comparing them sidesteps having to know.
 *
 * All of them silent is answered with all of them: that is a take of nothing,
 * and the caller says so in better words than an empty list would.
 */
export function inputsWorthKeeping(channels: readonly Float32Array[]): number[] {
  const peaks = channels.map(peakOf)
  const loudest = Math.max(0, ...peaks)

  const kept = peaks
    .map((peak, index) => ({ peak, index }))
    .filter(({ peak }) => peak >= QUIET_IN_ITSELF || peak >= loudest * BESIDE_THE_LOUDEST)
    .map(({ index }) => index)

  return kept.length === 0 ? channels.map((_, index) => index) : kept
}

/**
 * What one channel of a capture is called, wherever it is shown.
 *
 * A stereo capture is left and right because that is what it is; anything
 * wider is numbered, since nothing says which socket fed which channel.
 */
export function channelName(index: number, count: number): string {
  if (count <= 1) return 'The only channel'
  if (count === 2) return index === 0 ? 'Left' : 'Right'
  return `Channel ${index + 1}`
}

/**
 * How the channels of a device are offered.
 *
 * They are named after the stream rather than after sockets, because nothing
 * reports how many sockets a device really has: a laptop's built-in microphone
 * array and a two-input interface both arrive as two channels carrying
 * different sound, and are indistinguishable from inside the browser.
 */
export function inputOptions(count: number): { value: InputChoice; label: string }[] {
  if (count <= 1) return [{ value: ALL_INPUTS, label: channelName(0, count) }]
  return [
    { value: ALL_INPUTS, label: count === 2 ? 'Both together' : `All ${count} together` },
    ...Array.from({ length: count }, (_, index) => ({
      value: index + 1,
      label: `${channelName(index, count)} only`
    }))
  ]
}
