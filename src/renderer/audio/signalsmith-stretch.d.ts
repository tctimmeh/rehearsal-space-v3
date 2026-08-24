declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    output?: number
    active?: boolean
    input?: number
    rate?: number
    semitones?: number
    tonalityHz?: number
    formantSemitones?: number
    formantCompensation?: boolean
    formantBaseHz?: number
    loopStart?: number
    loopEnd?: number
  }

  export interface StretchNode extends AudioNode {
    /** Adds a scheduled change; `now` applies it without waiting. */
    schedule(change: StretchSchedule, now?: boolean): void
    start(when?: number): void
    stop(when?: number): void
    /**
     * Processing delay in seconds, in live-input mode. The documentation says
     * this returns a number; it actually resolves one.
     */
    latency(): number | Promise<number>
    addBuffers(buffers: Float32Array[]): Promise<number>
    dropBuffers(): void
    configure(options: Record<string, unknown>): void
    readonly inputTime: number
    setUpdateInterval(seconds: number, callback?: () => void): void
  }

  export default function SignalsmithStretch(
    context: BaseAudioContext,
    channelOptions?: AudioWorkletNodeOptions
  ): Promise<StretchNode>
}
