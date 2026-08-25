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
  private blocks: Float32Array[][] = []
  private sampleRate = 48000
  private static moduleLoaded: Promise<void> | null = null

  get recording(): boolean {
    return this.node !== null
  }

  async start(context: AudioContext, deviceId?: string): Promise<void> {
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
    this.node.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
      this.blocks.push(event.data)
    }
    this.source.connect(this.node)
    /* Not connected onward: a take must not be heard back through the mix. */
  }

  /** Stops, and hands back everything captured since it started. */
  stop(): Take | null {
    const stream = this.stream
    this.node?.port.close()
    this.node?.disconnect()
    this.source?.disconnect()
    for (const track of stream?.getTracks() ?? []) track.stop()

    /* Chromium reports this and the type definitions do not know about it. */
    const settings = stream?.getAudioTracks()[0]?.getSettings() as
      | { latency?: number }
      | undefined
    const inputLatency = Number(settings?.latency ?? 0) || 0
    const sampleRate = this.sampleRate
    const blocks = this.blocks

    this.node = null
    this.source = null
    this.stream = null
    this.blocks = []

    if (blocks.length === 0) return null
    const channelCount = blocks[0]?.length ?? 1
    const frames = blocks.reduce((total, block) => total + (block[0]?.length ?? 0), 0)

    const channels = Array.from({ length: channelCount }, () => new Float32Array(frames))
    let offset = 0
    for (const block of blocks) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        channels[channel]?.set(block[channel] ?? new Float32Array(0), offset)
      }
      offset += block[0]?.length ?? 0
    }

    return { channels, sampleRate, inputLatency }
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

