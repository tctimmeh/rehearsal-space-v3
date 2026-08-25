import { decayedLevel } from '@core/audio/level'

export interface InputInfo {
  /** What the device opened calls itself. The point when none was named. */
  name: string
  channels: number
}

export type LevelListener = (levels: readonly number[]) => void

const WANTED_CHANNELS = 32
const WINDOW_SIZE = 1024

/**
 * Holds an input open and reports what is arriving on each of its channels.
 *
 * This is how a device is asked about itself as well: the channel count and
 * the name are only settled once a track exists, so the same open that feeds
 * the meters answers those too rather than opening the device twice.
 *
 * The analysers are connected onward through a silent gain into the
 * destination. An unconnected branch of the graph is not guaranteed to be
 * rendered at all, and a meter that reads zero because nothing pulled it looks
 * exactly like a broken microphone.
 */
export class InputMonitor {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analysers: AnalyserNode[] = []
  private window = new Float32Array(WINDOW_SIZE)
  private levels: number[] = []
  private listeners = new Set<LevelListener>()
  private frame: number | null = null
  private lastTick = 0

  async start(deviceId: string): Promise<InputInfo> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId === '' ? {} : { deviceId: { exact: deviceId } }),
        channelCount: { ideal: WANTED_CHANNELS },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })

    const track = this.stream.getAudioTracks()[0]
    const context = new AudioContext()
    this.context = context
    await context.resume()

    const source = context.createMediaStreamSource(this.stream)
    const channels = Math.max(1, source.channelCount)
    const splitter = context.createChannelSplitter(channels)
    const silence = context.createGain()
    silence.gain.value = 0
    source.connect(splitter)

    this.analysers = Array.from({ length: channels }, (_, channel) => {
      const analyser = context.createAnalyser()
      analyser.fftSize = WINDOW_SIZE
      /* Smoothing is for spectra; a level is smoothed by its own decay. */
      analyser.smoothingTimeConstant = 0
      splitter.connect(analyser, channel)
      analyser.connect(silence)
      return analyser
    })
    silence.connect(context.destination)

    this.levels = this.analysers.map(() => 0)
    this.lastTick = context.currentTime
    this.tick()

    return { name: track?.label ?? '', channels }
  }

  listen(listener: LevelListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stop(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.frame = null
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.context?.close()
    this.stream = null
    this.context = null
    this.analysers = []
    this.listeners.clear()
  }

  private tick = (): void => {
    const context = this.context
    if (context === null) return

    const elapsed = context.currentTime - this.lastTick
    this.lastTick = context.currentTime

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
