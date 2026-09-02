import SignalsmithStretch from 'signalsmith-stretch'

/**
 * Room past the end for the shifter to finish what it was given. A phase
 * vocoder hands its last block back a little after the audio that produced it,
 * and cutting the render at the last input sample would cut the tail off.
 */
const TAIL_SECONDS = 0.25

/**
 * Renders audio at a different pitch, as fast as the machine can manage.
 *
 * The same shifter the song plays through, driven offline — so a take is
 * corrected with the very thing that will be applied to it later, and the two
 * cancel exactly rather than nearly.
 */
export async function shiftPitch(
  channels: Float32Array[],
  sampleRate: number,
  semitones: number
): Promise<Float32Array[]> {
  const frames = channels[0]?.length ?? 0
  if (semitones === 0 || frames === 0) return [...channels]

  const context = new OfflineAudioContext({
    numberOfChannels: channels.length,
    length: frames + Math.round(TAIL_SECONDS * sampleRate),
    sampleRate
  })
  const stretch = await SignalsmithStretch(context, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [channels.length]
  })
  stretch.connect(context.destination)

  /*
   * Both of these have to reach the worklet before rendering starts. An
   * offline render runs to the end in one go, and anything still in flight
   * arrives to find the audio already rendered — which presents as silence
   * rather than as an error. The port keeps its order, so waiting on the
   * second is waiting on both.
   */
  stretch.schedule({ active: true, input: 0, rate: 1, semitones }, true)
  await stretch.addBuffers(channels)

  const rendered = await context.startRendering()
  return channels.map((_, channel) => rendered.getChannelData(channel))
}
