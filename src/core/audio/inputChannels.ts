/** 0 means take the device as it comes; otherwise the 1-based input to keep. */
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

/** How the inputs of a device are offered, given how many it turned out to have. */
export function inputOptions(count: number): { value: InputChoice; label: string }[] {
  if (count <= 1) return [{ value: ALL_INPUTS, label: 'The only input' }]
  return [
    ...Array.from({ length: count }, (_, index) => ({
      value: index + 1,
      label: `Input ${index + 1}`
    })),
    { value: ALL_INPUTS, label: `All ${count} together` }
  ]
}
