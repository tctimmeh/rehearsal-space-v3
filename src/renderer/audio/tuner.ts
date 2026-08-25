import { ALL_INPUTS } from '@core/audio/inputChannels'
import { decimate, detectPitch, rms } from '@core/music/detectPitch'

/** Long enough to hold several periods of a bass note, short enough to follow. */
const WINDOW = 8192
/**
 * Nothing being listened for is anywhere near the top of the range, and the
 * cost of the search grows with the square of the rate.
 */
const DECIMATION = 3
const LISTEN_MS = 50
const WANTED_CHANNELS = 32

export interface Heard {
  /** Null when there is nothing periodic to report. */
  frequency: number | null
  clarity: number
  level: number
}

export type HeardListener = (heard: Heard) => void

/**
 * Listens to an input and says what note is being played.
 *
 * The detection runs on the page rather than in a worklet: at a third of the
 * sample rate the search is small enough that it does not need its own thread,
 * and keeping it in ordinary code is what lets it be tested against signals
 * whose pitch is already known.
 */
export class Tuner {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private samples = new Float32Array(WINDOW)
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<HeardListener>()
  private attempt = 0

  get listening(): boolean {
    return this.timer !== null
  }

  listen(listener: HeardListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(deviceId: string, channel: number): Promise<void> {
    this.stop()
    const mine = (this.attempt += 1)

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId === '' ? {} : { deviceId: { exact: deviceId } }),
        channelCount: { ideal: WANTED_CHANNELS },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })
    if (mine !== this.attempt) {
      for (const track of stream.getTracks()) track.stop()
      return
    }
    this.stream = stream

    const context = new AudioContext()
    this.context = context
    await context.resume()

    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = WINDOW
    analyser.smoothingTimeConstant = 0

    /* One channel: an interface with a guitar in one socket and a room
       microphone in the other would otherwise be tuned to both at once. */
    const channels = Math.max(1, source.channelCount)
    const wanted = channel === ALL_INPUTS ? 0 : Math.min(channels - 1, channel - 1)
    const splitter = context.createChannelSplitter(channels)
    source.connect(splitter)
    splitter.connect(analyser, wanted)

    /* An unconnected branch is not guaranteed to be rendered at all, and a
       tuner that hears nothing because nothing pulled it looks broken. */
    const silence = context.createGain()
    silence.gain.value = 0
    analyser.connect(silence)
    silence.connect(context.destination)

    this.analyser = analyser
    this.timer = setInterval(() => this.hear(), LISTEN_MS)
  }

  stop(): void {
    this.attempt += 1
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.context?.close()
    this.stream = null
    this.context = null
    this.analyser = null
  }

  private hear(): void {
    const analyser = this.analyser
    const context = this.context
    if (analyser === null || context === null) return

    analyser.getFloatTimeDomainData(this.samples)
    const level = rms(this.samples)
    const narrowed = decimate(this.samples, DECIMATION)
    const reading = detectPitch(narrowed, { sampleRate: context.sampleRate / DECIMATION })

    const heard: Heard = {
      frequency: reading?.frequency ?? null,
      clarity: reading?.clarity ?? 0,
      level
    }
    for (const listener of [...this.listeners]) listener(heard)
  }
}

export const tuner = new Tuner()
