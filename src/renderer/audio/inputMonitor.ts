import { ChannelLevels, type LevelListener } from './channelLevels'

export interface InputInfo {
  /** What the device opened calls itself. The point when none was named. */
  name: string
  channels: number
}

export type { LevelListener }

const WANTED_CHANNELS = 32

/**
 * Holds an input open and reports what is arriving on each of its channels.
 *
 * This is how a device is asked about itself as well: the channel count and
 * the name are only settled once a track exists, so the same open that feeds
 * the meters answers those too rather than opening the device twice.
 */
export class InputMonitor {
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private levels: ChannelLevels | null = null

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
    this.levels = new ChannelLevels(context, source, channels)

    return { name: track?.label ?? '', channels }
  }

  listen(listener: LevelListener): () => void {
    return this.levels?.listen(listener) ?? (() => undefined)
  }

  stop(): void {
    this.levels?.stop()
    this.levels = null
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    void this.context?.close()
    this.stream = null
    this.context = null
  }
}
