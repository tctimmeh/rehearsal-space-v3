import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch'

import { audibleGain } from '@core/mix/audible'
import { isShiftNeutral, shifterSemitones } from '@core/mix/pitch'
import type { AudioChannel, PitchOffset, Song } from '@core/song/song'

/** Ramp length for gain changes: long enough not to click, short enough to feel instant. */
const GAIN_RAMP_S = 0.015

/** A moment past the end, so the last of the audio is never clipped short. */
const END_GRACE_S = 0.05

/** Room for the shifter's own delay, which the other paths are held back by. */
const MAX_ALIGN_DELAY_S = 1

/** Long enough not to click, short enough that a knob still feels connected. */
const CROSSFADE_S = 0.04

interface LoadedChannel {
  channel: AudioChannel
  buffer: AudioBuffer
  /** Fader and mute/solo, kept separate so one does not overwrite the other. */
  gain: GainNode
  source: AudioBufferSourceNode | null
}

/**
 * Owns the Web Audio graph and the clock everything else reads.
 *
 *   source (playbackRate = speed) → channel gain → Music bus → master
 *   metronome                     → Click bus                → master
 *
 * The pitch shifter belongs on the Music bus and arrives in M5; the graph is
 * shaped for it now so nothing has to move.
 */
export class AudioEngine {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private clickBus: GainNode | null = null
  private channels = new Map<string, LoadedChannel>()

  /** The pitch shifter, made on first use — it costs a WASM module to load. */
  private stretch: StretchNode | null = null
  private stretchLoading: Promise<StretchNode | null> | null = null
  private clickDelay: DelayNode | null = null
  /** Holds the unshifted path level with the shifted one. */
  private dryDelay: DelayNode | null = null
  private dryGain: GainNode | null = null
  private wetGain: GainNode | null = null
  private stretchLatency = 0
  private pitch: PitchOffset = { semitones: 0, cents: 0 }

  private playing = false
  /** Song time at the moment the clock was last anchored. */
  private anchorSong = 0
  private anchorContext = 0
  private rate = 1

  private start = 0
  private end = 0
  private endTimer: ReturnType<typeof setTimeout> | null = null
  private onEnded: (() => void) | null = null

  private ensureContext(): AudioContext {
    if (this.context === null) {
      const context = new AudioContext({ latencyHint: 'playback' })
      this.master = context.createGain()
      this.musicBus = context.createGain()
      this.clickBus = context.createGain()
      this.clickDelay = context.createDelay(MAX_ALIGN_DELAY_S)
      this.dryDelay = context.createDelay(MAX_ALIGN_DELAY_S)
      this.dryGain = context.createGain()
      this.wetGain = context.createGain()

      /*
       * Both paths run at once and stay level with each other, so switching
       * between them is a crossfade rather than a cut:
       *
       *   musicBus ─► dryDelay ─► dryGain ─┐
       *           └─► shifter  ─► wetGain ─┴─► master
       *
       * The shifter is fed even while nothing is being shifted, because it
       * takes its 120 ms of latency to fill and would otherwise answer with
       * silence for that long the moment a knob was touched. The unshifted
       * path is delayed to match, so the two carry the same moment of music
       * and a crossfade between them stays coherent.
       */
      this.musicBus.connect(this.dryDelay)
      this.dryDelay.connect(this.dryGain)
      this.dryGain.connect(this.master)
      this.wetGain.connect(this.master)
      this.dryGain.gain.value = 1
      this.wetGain.gain.value = 0

      this.clickBus.connect(this.clickDelay)
      this.clickDelay.connect(this.master)
      this.master.connect(context.destination)
      this.context = context

      /* Load it now, so the first touch of a knob is not the thing that waits. */
      void this.loadStretch()
    }
    return this.context
  }

  /** Song time now, whether or not anything is playing. */
  get position(): number {
    if (!this.playing || this.context === null) return this.anchorSong
    const elapsed = this.context.currentTime - this.anchorContext
    return Math.min(this.end, this.anchorSong + elapsed * this.rate)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /** True once the song has run past its last channel. */
  get finished(): boolean {
    return this.playing && this.position >= this.end
  }

  /**
   * Tempo. Sources already playing simply change speed; ones still waiting to
   * begin have to be re-timed, because how long their wait is depends on it.
   */
  setSpeed(speed: number): void {
    if (speed === this.rate || speed <= 0) return
    const context = this.context
    const position = this.position

    this.rate = speed
    this.anchorSong = position
    if (context !== null) this.anchorContext = context.currentTime

    for (const loaded of this.channels.values()) {
      if (loaded.source === null) continue
      if (position <= loaded.channel.startTime) {
        this.startChannel(loaded, position)
      } else if (context !== null) {
        loaded.source.playbackRate.setValueAtTime(speed, context.currentTime)
      }
    }

    if (this.playing) this.scheduleEnd()
    this.applyShift()
  }

  setPitch(pitch: PitchOffset): void {
    if (pitch.semitones === this.pitch.semitones && pitch.cents === this.pitch.cents) return
    this.pitch = pitch
    this.applyShift()
  }

  /**
   * Puts the shifter in the path, or takes it out. Out is the point: at normal
   * speed and pitch the audio reaches the output untouched, rather than through
   * a phase vocoder set to do nothing.
   */
  /**
   * Points the output at whichever path is wanted. Nothing is rewired: both
   * are already running, so this is a short crossfade and never a gap.
   */
  private applyShift(): void {
    const { context, dryGain, wetGain, stretch } = this
    if (context === null || dryGain === null || wetGain === null) return

    const shift = shifterSemitones(this.rate, this.pitch)
    const wet = stretch !== null && !isShiftNeutral(this.rate, this.pitch)

    /* Ask for the new pitch before fading towards it, so the shifter is
       already producing it by the time it can be heard. */
    if (stretch !== null && wet) stretch.schedule({ semitones: shift }, true)

    crossfade(dryGain, wet ? 0 : 1, context)
    crossfade(wetGain, wet ? 1 : 0, context)
  }

  private async loadStretch(): Promise<StretchNode | null> {
    if (this.stretch !== null) return this.stretch
    const context = this.context
    if (context === null) return null

    this.stretchLoading ??= SignalsmithStretch(context)
      .then(async (node) => {
        node.schedule({ active: true, semitones: 0 }, true)
        node.start()
        node.connect(this.wetGain as GainNode)
        this.musicBus?.connect(node)
        this.stretch = node

        /* Now the latency is knowable, everything else can be lined up to it. */
        this.stretchLatency = Number(await node.latency()) || 0
        this.alignDelays()
        this.applyShift()
        return node
      })
      .catch(() => null)

    return this.stretchLoading
  }

  /** Holds the unshifted music and the click level with the shifted music. */
  private alignDelays(): void {
    const context = this.context
    if (context === null) return
    const delay = Math.min(MAX_ALIGN_DELAY_S, Math.max(0, this.stretchLatency))
    this.dryDelay?.delayTime.setValueAtTime(delay, context.currentTime)
    this.clickDelay?.delayTime.setValueAtTime(delay, context.currentTime)
  }

  setBounds(start: number, end: number): void {
    this.start = start
    this.end = end
    if (this.playing) this.scheduleEnd()
  }

  /** Called when the song runs past its last channel. */
  whenEnded(handler: () => void): void {
    this.onEnded = handler
  }

  /**
   * The end is scheduled rather than watched for, so it does not depend on the
   * UI getting a frame — a window nobody is looking at still finishes its song.
   */
  private scheduleEnd(): void {
    this.clearEndTimer()
    const remaining = (this.end - this.position) / this.rate + END_GRACE_S
    if (remaining <= 0) return
    this.endTimer = setTimeout(() => {
      this.endTimer = null
      this.onEnded?.()
    }, remaining * 1000)
  }

  private clearEndTimer(): void {
    if (this.endTimer === null) return
    clearTimeout(this.endTimer)
    this.endTimer = null
  }

  /**
   * Brings the graph in line with the song: decodes anything new, drops
   * anything gone, and leaves untouched channels playing.
   */
  async load(
    song: Song,
    readAudio: (file: string) => Promise<Uint8Array>
  ): Promise<void> {
    const context = this.ensureContext()
    const wanted = new Map(
      song.channels
        .filter((channel): channel is AudioChannel => channel.kind === 'audio')
        .map((channel) => [channel.id, channel])
    )

    for (const [id, loaded] of this.channels) {
      if (wanted.has(id)) continue
      loaded.source?.stop()
      loaded.gain.disconnect()
      this.channels.delete(id)
    }

    await Promise.all(
      [...wanted.values()].map(async (channel) => {
        const existing = this.channels.get(channel.id)
        if (existing !== undefined) {
          existing.channel = channel
          return
        }
        const bytes = await readAudio(channel.file)
        /* decodeAudioData detaches the buffer, so hand it a copy of its own. */
        const buffer = await context.decodeAudioData(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        )
        const gain = context.createGain()
        gain.connect(this.musicBus as GainNode)
        this.channels.set(channel.id, { channel, buffer, gain, source: null })
      })
    )

    this.applyMix(song)
    if (this.playing) this.restartSources()
  }

  /** Faders, mute and solo, and the two bus levels. */
  applyMix(song: Song): void {
    const context = this.context
    if (context === null) return

    for (const [id, loaded] of this.channels) {
      const channel = song.channels.find((entry) => entry.id === id)
      if (channel === undefined || channel.kind !== 'audio') continue
      loaded.channel = channel
      rampTo(loaded.gain, audibleGain(channel, song.channels), context)
    }

    rampTo(this.musicBus as GainNode, song.buses.music, context)
    rampTo(this.clickBus as GainNode, song.buses.click, context)
  }

  async play(): Promise<void> {
    const context = this.ensureContext()
    if (context.state === 'suspended') await context.resume()
    if (this.playing) return
    /* Starting at the very end would play nothing; go back to the beginning. */
    if (this.anchorSong >= this.end) this.anchorSong = this.start
    this.playing = true
    this.restartSources()
    this.scheduleEnd()
  }

  pause(): void {
    if (!this.playing) return
    this.anchorSong = this.position
    this.playing = false
    this.clearEndTimer()
    this.stopSources()
  }

  stop(): void {
    this.playing = false
    this.clearEndTimer()
    this.stopSources()
    this.anchorSong = this.start
  }

  /** Scrubbing must not interrupt playback: the sources restart at the new spot. */
  seek(songTime: number): void {
    this.anchorSong = Math.min(this.end, Math.max(this.start, songTime))
    if (this.playing) {
      this.restartSources()
      this.scheduleEnd()
    } else {
      this.stopSources()
    }
  }

  dispose(): void {
    this.clearEndTimer()
    this.stopSources()
    for (const loaded of this.channels.values()) loaded.gain.disconnect()
    this.channels.clear()
    void this.context?.close()
    this.context = null
  }

  private stopSources(): void {
    for (const loaded of this.channels.values()) {
      if (loaded.source === null) continue
      loaded.source.onended = null
      try {
        loaded.source.stop()
      } catch {
        /* Already stopped. */
      }
      loaded.source.disconnect()
      loaded.source = null
    }
  }

  /**
   * Rebuilds every source for the current position. A source node is
   * single-use, so seeking and resuming both come through here.
   */
  private restartSources(): void {
    const context = this.context
    if (context === null) return

    this.stopSources()
    const songTime = this.anchorSong
    this.anchorContext = context.currentTime
    this.anchorSong = songTime

    for (const loaded of this.channels.values()) {
      const { channel } = loaded
      const endsAt = channel.startTime + channel.duration
      if (songTime >= endsAt) continue

      this.startChannel(loaded, songTime)
    }
  }

  /** Starts one channel's source for a given song time, replacing any current one. */
  private startChannel(loaded: LoadedChannel, songTime: number): void {
    const context = this.context
    if (context === null) return

    if (loaded.source !== null) {
      try {
        loaded.source.stop()
      } catch {
        /* Already stopped. */
      }
      loaded.source.disconnect()
      loaded.source = null
    }

    const { channel } = loaded
    if (songTime >= channel.startTime + channel.duration) return

    const source = context.createBufferSource()
    source.buffer = loaded.buffer
    source.playbackRate.value = this.rate
    source.connect(loaded.gain)

    if (songTime <= channel.startTime) {
      /* Still to come: wait out the gap in wall-clock terms. */
      const wait = (channel.startTime - songTime) / this.rate
      source.start(context.currentTime + wait, 0)
    } else {
      source.start(context.currentTime, songTime - channel.startTime)
    }
    loaded.source = source
  }
}

/** A short linear fade. Both paths carry the same music, so this sums to unity. */
function crossfade(node: GainNode, target: number, context: AudioContext): void {
  const now = context.currentTime
  node.gain.cancelScheduledValues(now)
  node.gain.setValueAtTime(node.gain.value, now)
  node.gain.linearRampToValueAtTime(target, now + CROSSFADE_S)
}

function rampTo(node: GainNode, value: number, context: AudioContext): void {
  node.gain.cancelScheduledValues(context.currentTime)
  node.gain.setTargetAtTime(value, context.currentTime, GAIN_RAMP_S)
}

export const audioEngine = new AudioEngine()
