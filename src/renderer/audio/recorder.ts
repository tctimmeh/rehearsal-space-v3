/*
 * The processor's source is inlined and handed to the worklet as a blob rather
 * than pointed at as a file. The page is loaded from disk, where a content
 * policy's notion of "same origin" does not hold, so an asset URL is refused —
 * which presents as the worklet simply failing to load.
 */
import processorSource from './recorderProcessor.js?raw'

export interface Take {
  channels: Float32Array[]
  sampleRate: number
  /** What the input added between the sound happening and it arriving. */
  inputLatency: number
  /**
   * Where in the song the first captured sample belongs, worked out the moment
   * it arrived. It cannot be worked out later: stopping moves the clock's
   * anchors, so by the time a take is handed over there is nothing left to
   * convert its timestamps against.
   */
  songTimeAtFirstSample: number
}

interface Block {
  at: number
  channels: Float32Array[]
}

/**
 * More than any interface this app expects. Asking for more than a device has
 * gets what it has; asking for one gets the first socket only, which is how a
 * microphone in the second one comes back silent.
 */
const WANTED_CHANNELS = 32

/**
 * Captures from an input device into memory.
 *
 * Everything the browser offers to help a phone call — echo cancellation, noise
 * suppression, automatic gain — is refused. They are all designed to make
 * speech intelligible by altering it, which is the opposite of what recording
 * an instrument wants.
 */
export class Recorder {
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private blocks: Block[] = []
  private capturing = false
  private placeInSong: ((contextTime: number) => number) | null = null
  private songTimeAtFirstSample = 0
  private sampleRate = 48000
  private static moduleLoaded: Promise<void> | null = null

  get isOpen(): boolean {
    return this.node !== null
  }

  /**
   * Opens the device and leaves it running with nothing being kept.
   *
   * Arming does this, so that starting a take is only a flag: opening a device
   * takes a few hundred milliseconds, which is exactly the drift that arming
   * exists to remove.
   */
  async open(context: AudioContext, deviceId?: string): Promise<void> {
    if (this.node !== null) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId === undefined || deviceId === '' ? {} : { deviceId: { exact: deviceId } }),
        channelCount: { ideal: WANTED_CHANNELS },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    })

    Recorder.moduleLoaded ??= context.audioWorklet.addModule(
      URL.createObjectURL(new Blob([processorSource], { type: 'text/javascript' }))
    )
    await Recorder.moduleLoaded

    this.blocks = []
    this.sampleRate = context.sampleRate
    this.source = context.createMediaStreamSource(this.stream)
    /* Without this the node takes the graph's channel count and quietly drops
       every input past the first two. */
    this.node = new AudioWorkletNode(context, 'rehearsal-recorder', {
      channelCount: Math.max(1, this.source.channelCount),
      channelCountMode: 'explicit',
      channelInterpretation: 'discrete'
    })
    this.node.port.onmessage = (event: MessageEvent<Block>) => {
      if (!this.capturing) return
      if (this.blocks.length === 0 && this.placeInSong !== null) {
        this.songTimeAtFirstSample = this.placeInSong(event.data.at)
      }
      this.blocks.push(event.data)
    }
    this.source.connect(this.node)
    /* Not connected onward: a take must not be heard back through the mix. */

    /* Armed and started in the same breath: the player did not wait for the
       device, so the take begins the moment the device is ready. */
    if (this.capturing) this.node.port.postMessage({ capturing: true })
  }

  /**
   * Begins keeping what arrives, whether or not the device has finished
   * opening. Waiting for it here would silently drop the start of a take.
   */
  beginTake(placeInSong: (contextTime: number) => number): void {
    this.blocks = []
    this.placeInSong = placeInSong
    this.songTimeAtFirstSample = 0
    this.capturing = true
    this.node?.port.postMessage({ capturing: true })
  }

  /** Stops keeping, and hands back everything since the take began. */
  endTake(): Take | null {
    if (!this.capturing) return null
    this.capturing = false
    this.node?.port.postMessage({ capturing: false })

    const blocks = this.blocks
    this.blocks = []
    if (blocks.length === 0) return null

    /* Chromium reports this and the type definitions do not know about it. */
    const settings = this.stream?.getAudioTracks()[0]?.getSettings() as
      | { latency?: number }
      | undefined
    const inputLatency = Number(settings?.latency ?? 0) || 0

    const channelCount = blocks[0]?.channels.length ?? 1
    const frames = blocks.reduce((total, block) => total + (block.channels[0]?.length ?? 0), 0)

    const channels = Array.from({ length: channelCount }, () => new Float32Array(frames))
    let offset = 0
    for (const block of blocks) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        channels[channel]?.set(block.channels[channel] ?? new Float32Array(0), offset)
      }
      offset += block.channels[0]?.length ?? 0
    }

    return {
      channels,
      sampleRate: this.sampleRate,
      inputLatency,
      songTimeAtFirstSample: this.songTimeAtFirstSample
    }
  }

  /** Stops keeping, and throws away everything since the take began. */
  dropTake(): void {
    this.capturing = false
    this.node?.port.postMessage({ capturing: false })
    this.blocks = []
  }

  /** Lets the device go. Disarming does this; a take must be ended first. */
  close(): void {
    this.capturing = false
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.node = null
    this.source = null
    this.stream = null
    this.blocks = []
  }

}

/**
 * The real input devices.
 *
 * Browsers also list stand-ins — an entry called "Default", and on some systems
 * a "Communications" one — which are not hardware but a way of saying "whatever
 * the system is set to". Offering those alongside a choice that already means
 * the same thing gives two entries that do one job, so they are left out.
 */
const STAND_INS = new Set(['default', 'communications'])

export async function inputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(
    (device) => device.kind === 'audioinput' && !STAND_INS.has(device.deviceId)
  )
}

