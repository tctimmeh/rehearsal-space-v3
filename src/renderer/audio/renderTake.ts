import SignalsmithStretch from 'signalsmith-stretch'

/**
 * Room past the end for the shifter to finish what it was given. A phase
 * vocoder hands its last block back a little after the audio that produced it,
 * and cutting the render at the last input sample would cut the tail off.
 */
const TAIL_SECONDS = 0.25

export interface TakeCorrection {
  /** What to shift the take by, to undo the pitch it was played against. */
  semitones: number
  /** How fast to read it, to undo the tempo it was played against. */
  rate: number
}

const NOTHING_TO_DO = ({ semitones, rate }: TakeCorrection): boolean =>
  semitones === 0 && rate === 1

/**
 * Renders a take as the song will play it, as fast as the machine can manage.
 *
 * The same shifter the song plays through, driven offline — so a take is
 * corrected with the very thing that will be applied to it later, and the two
 * cancel exactly rather than nearly. Pitch and time are one pass, because they
 * are one pass in the shifter: it stretches without resampling, so changing the
 * length does not drag the pitch along with it.
 */
export async function renderTake(
  channels: Float32Array[],
  sampleRate: number,
  correction: TakeCorrection
): Promise<Float32Array[]> {
  const frames = channels[0]?.length ?? 0
  if (NOTHING_TO_DO(correction) || frames === 0) return [...channels]

  const { semitones, rate } = correction
  /* Read at a rate, and the audio takes that much longer to come out. */
  const length = Math.ceil(frames / rate) + Math.round(TAIL_SECONDS * sampleRate)
  const context = new OfflineAudioContext({
    numberOfChannels: channels.length,
    length,
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
  stretch.schedule({ active: true, input: 0, rate, semitones }, true)
  await stretch.addBuffers(channels)

  const rendered = await context.startRendering()
  return channels.map((_, channel) => rendered.getChannelData(channel))
}
