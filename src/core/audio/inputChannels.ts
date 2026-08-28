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
 * Quieter than this and nothing was plugged in: it is the interface's own
 * noise floor. An unused socket on a real one measures around -64 dBFS at its
 * loudest; anything actually connected, however gently played, is far above.
 */
const SILENT_PEAK = 0.004

const carriesSignal = (channel: Float32Array): boolean => {
  for (const sample of channel) {
    if (Math.abs(sample) >= SILENT_PEAK) return true
  }
  return false
}

/**
 * Drops the inputs that had nothing plugged into them.
 *
 * Taking a two-socket interface as it comes is right when two things are
 * plugged in and wrong when one is: a guitar in the first socket alone gives a
 * take with the guitar hard left and silence hard right, which is what "both
 * together" turns out to mean most of the time. So an input that carried
 * nothing is not kept, and a lone guitar records as mono however the device
 * was asked for.
 *
 * All of them silent is left alone — that is a take of nothing, and the caller
 * says so in better words than an empty array would.
 */
export function dropSilentInputs(channels: readonly Float32Array[]): Float32Array[] {
  const heard = channels.filter((channel) => carriesSignal(channel))
  return heard.length === 0 ? [...channels] : heard
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
