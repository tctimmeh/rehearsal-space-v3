import { decayedLevel } from '@core/audio/level'

export type LevelListener = (levels: readonly number[]) => void

const WINDOW_SIZE = 1024

/**
 * What is arriving on each channel of an input, as a number per channel.
 *
 * Split out because two things hold an input open for different reasons and
 * both want to show it: the recording dialog, which opens a device only to look
 * at it, and the recorder, which is holding the device it is about to capture
 * from. Metering the recorder's own stream is also the only way to be sure the
 * meters are showing the device that is armed rather than one opened beside it.
 *
 * The analysers are connected onward through a silent gain. An unconnected
 * branch of the graph is not guaranteed to be rendered at all, and a meter that
 * reads zero because nothing pulled it looks exactly like a broken microphone.
 */
export class ChannelLevels {
  private readonly analysers: AnalyserNode[]
  private readonly silence: GainNode
  private readonly window = new Float32Array(WINDOW_SIZE)
  private readonly listeners = new Set<LevelListener>()
  private levels: number[]
  private frame: number | null = null
  private lastTick: number
  private running = true

  constructor(
    private readonly context: AudioContext,
    source: AudioNode,
    readonly channels: number
  ) {
    const splitter = context.createChannelSplitter(channels)
    this.silence = context.createGain()
    this.silence.gain.value = 0
    source.connect(splitter)

    this.analysers = Array.from({ length: channels }, (_, channel) => {
      const analyser = context.createAnalyser()
      analyser.fftSize = WINDOW_SIZE
      /* Smoothing is for spectra; a level is smoothed by its own decay. */
      analyser.smoothingTimeConstant = 0
      splitter.connect(analyser, channel)
      analyser.connect(this.silence)
      return analyser
    })
    this.silence.connect(context.destination)

    this.levels = this.analysers.map(() => 0)
    this.lastTick = context.currentTime
    this.tick()
  }

  listen(listener: LevelListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stop(): void {
    this.running = false
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    this.silence.disconnect()
    for (const analyser of this.analysers) analyser.disconnect()
    this.listeners.clear()
  }

  private tick = (): void => {
    if (!this.running) return

    const elapsed = this.context.currentTime - this.lastTick
    this.lastTick = this.context.currentTime

    this.levels = this.analysers.map((analyser, channel) => {
      analyser.getFloatTimeDomainData(this.window)
      let peak = 0
      for (const sample of this.window) {
        const magnitude = Math.abs(sample)
        if (magnitude > peak) peak = magnitude
      }
      return decayedLevel(this.levels[channel] ?? 0, peak, elapsed)
    })

    for (const listener of this.listeners) listener(this.levels)
    this.frame = requestAnimationFrame(this.tick)
  }
}
