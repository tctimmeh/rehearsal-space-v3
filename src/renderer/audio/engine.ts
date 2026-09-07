import SignalsmithStretch, { type StretchNode } from 'signalsmith-stretch'

import { audibleGain } from '@core/mix/audible'
import { beatsBetween, solveMetronome, type MetronomeTiming } from '@core/metronome/solve'
import { shifterSemitones } from '@core/mix/pitch'
import { playFrom } from '@core/song/trim'
import type {
  AudioChannel,
  LoopRegion,
  MetronomeChannel,
  MetronomeSample,
  PitchOffset,
  Song
} from '@core/song/song'
import { loadClickSamples, type ClickPair } from './clickSamples'

/** Ramp length for gain changes: long enough not to click, short enough to feel instant. */
const GAIN_RAMP_S = 0.015

/** A moment past the end, so the last of the audio is never clipped short. */
const END_GRACE_S = 0.05

/** Room for the shifter's own delay, which the other paths are held back by. */
const MAX_ALIGN_DELAY_S = 1

/** How often the click scheduler tops itself up, and how far ahead it works. */
const CLICK_TICK_MS = 25
const CLICK_HORIZON_S = 0.2

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
  /**
   * Which song the decoded channels belong to.
   *
   * A channel id is unique inside its song and nowhere else — every song's
   * first recording is called "Take 1" and every one of them is `Take 1` —
   * so a buffer already decoded is only ever the right buffer for the same
   * song. Without this, opening a second song that happened to share an id
   * kept the first song's audio and played it under the second song's name.
   */
  private loadedSongId: string | null = null
  private clicks = new Map<MetronomeSample, ClickPair>()
  private clicksLoading: Promise<unknown> | null = null
  /** One entry per metronome channel, with its beats already worked out. */
  private metronomes: { channel: MetronomeChannel; timing: MetronomeTiming }[] = []
  private clickTimer: ReturnType<typeof setInterval> | null = null
  /** Clicks handed over but not yet sounded, so pausing can take them back. */
  private pendingClicks: AudioBufferSourceNode[] = []
  /** Song time up to which clicks have already been handed to the audio thread. */
  private clicksScheduledTo = 0

  /** The pitch shifter, made on first use — it costs a WASM module to load. */
  private stretch: StretchNode | null = null
  private stretchLoading: Promise<StretchNode | null> | null = null
  private clickDelay: DelayNode | null = null
  private stretchLatency = 0
  private pitch: PitchOffset = { semitones: 0, cents: 0 }

  private playing = false
  /** Set while play is getting ready, so the clock does not run before sound. */
  private starting = false
  /** Rising per attempt, so a stale start cannot resurrect itself. */
  private playAttempt = 0
  /** Resolves when a load the caller has announced has finished. */
  private awaited: { promise: Promise<void>; settle: () => void } | null = null
  /** Loads run one at a time; two at once would overwrite each other. */
  private loading: Promise<unknown> = Promise.resolve()
  /** Song time at the moment the clock was last anchored. */
  private anchorSong = 0
  private anchorContext = 0
  private rate = 1

  private start = 0
  /* While a take is being laid down the song has no end: it is as long as the
     performance turns out to be, which for the first channel of a new song is
     all there is. */
  private openEnded = false
  private end = 0
  /** The stretch being gone round, or null when playing straight through. */
  private loop: LoopRegion | null = null
  private nextTimer: ReturnType<typeof setTimeout> | null = null
  private onEnded: (() => void) | null = null

  private ensureContext(): AudioContext {
    if (this.context === null) {
      const context = new AudioContext({ latencyHint: 'playback' })
      this.master = context.createGain()
      this.musicBus = context.createGain()
      this.clickBus = context.createGain()
      this.clickDelay = context.createDelay(MAX_ALIGN_DELAY_S)

      /*
       * The music always runs through the shifter:
       *
       *   musicBus ─► shifter ─► master
       *   clickBus ─► delay   ─► master
       *
       * Set to no shift it is transparent — measured at -126 dB against a
       * direct render, which is float rounding — so there is nothing to gain
       * by routing around it, and routing around it was what made touching a
       * knob interrupt the music. The click is delayed to match the shifter's
       * latency, which is now simply constant.
       */
      this.clickBus.connect(this.clickDelay)
      this.clickDelay.connect(this.master)
      this.master.connect(context.destination)
      this.context = context

      /* Load these now, so the first touch of a knob is not the thing that waits. */
      void this.loadStretch()
      this.clicksLoading ??= loadClickSamples(context)
        .then((samples) => {
          this.clicks = samples
        })
        .catch(() => undefined)
    }
    return this.context
  }

  /** Song time now, whether or not anything is playing. */
  get position(): number {
    /* While getting ready the playhead stays put: it has not started yet, and
       a playhead that moves without sound is just a lie about where you are. */
    if (!this.playing || this.starting || this.context === null) return this.anchorSong
    return this.songTimeAt(this.context.currentTime)
  }

  /**
   * Song time at a moment on the graph's own clock. A take's first sample is
   * timestamped that way, and has to be turned back into a place in the song.
   */
  songTimeAt(contextTime: number): number {
    if (this.context === null) return this.anchorSong
    const reached = this.anchorSong + (contextTime - this.anchorContext) * this.rate
    return this.openEnded ? reached : Math.min(this.end, reached)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  /**
   * How far behind the playhead the sound actually is. A player follows what
   * they hear, so a take lines up with this much earlier in the song than the
   * clock said when it was captured.
   */
  get audibleDelay(): number {
    const output = this.context?.outputLatency || this.context?.baseLatency || 0
    return this.stretchLatency + output
  }

  /**
   * Where the stand-alone metronome puts its clicks: straight into the master,
   * with none of the delay the song's click bus carries.
   *
   * That delay exists to line clicks up with music that has been through the
   * shifter. This metronome has no music to agree with — it is its own
   * reference — so making it wait would only put it further behind the button
   * that started it.
   */
  get clickDestination(): AudioNode {
    this.ensureContext()
    return this.master as GainNode
  }

  /** The beat or accent recording of a voice, once they have loaded. */
  clickSample(name: MetronomeSample, accent: boolean): AudioBuffer | undefined {
    this.ensureContext()
    const pair = this.clicks.get(name)
    return accent ? pair?.accent : pair?.beat
  }

  /** Settles once the click samples are in memory. */
  clicksReady(): Promise<unknown> {
    this.ensureContext()
    return this.clicksLoading ?? Promise.resolve()
  }

  /** The graph's own context, for capture to share. */
  get audioContext(): AudioContext {
    return this.ensureContext()
  }

  /** True once the song has run past its last channel. */
  get finished(): boolean {
    return this.playing && !this.openEnded && this.position >= this.end
  }

  /**
   * Lets the playhead run past the end of the song, and stops it being sent
   * back to the top when it gets there.
   */
  get isOpenEnded(): boolean {
    return this.openEnded
  }

  setOpenEnded(open: boolean): void {
    if (open === this.openEnded) return
    this.openEnded = open
    if (open) this.clearNextTimer()
    else if (this.playing) this.scheduleNext()
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

    if (this.playing) this.scheduleNext()
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
  /** Tells the shifter what the two knobs add up to. Nothing is ever rewired. */
  private applyShift(): void {
    this.stretch?.schedule({ semitones: shifterSemitones(this.rate, this.pitch) }, true)
  }

  /**
   * Builds the music path once the shifter is ready. If it never becomes
   * ready — a broken worklet, a content policy that forbids it — the music
   * goes straight to the output instead, unshiftable but audible.
   */
  private async loadStretch(): Promise<StretchNode | null> {
    if (this.stretch !== null) return this.stretch
    const { context, musicBus, master } = this
    if (context === null || musicBus === null || master === null) return null

    this.stretchLoading ??= SignalsmithStretch(context)
      .then(async (node) => {
        node.schedule({ active: true, semitones: 0 }, true)
        node.start()
        musicBus.connect(node)
        node.connect(master)
        this.stretch = node

        this.stretchLatency = Number(await node.latency()) || 0
        this.clickDelay?.delayTime.setValueAtTime(
          Math.min(MAX_ALIGN_DELAY_S, Math.max(0, this.stretchLatency)),
          context.currentTime
        )
        this.applyShift()
        return node
      })
      .catch(() => {
        musicBus.connect(master)
        return null
      })

    return this.stretchLoading
  }

  private clampToSong(songTime: number): number {
    const atLeast = Math.max(this.start, songTime)
    return this.openEnded ? atLeast : Math.min(this.end, atLeast)
  }

  setBounds(start: number, end: number): void {
    this.start = start
    this.end = end
    if (this.playing) this.scheduleNext()
  }

  setLoop(loop: LoopRegion | null): void {
    this.loop = loop
    if (this.playing) this.scheduleNext()
  }

  /** Called when the song runs past its last channel. */
  whenEnded(handler: () => void): void {
    this.onEnded = handler
  }

  /**
   * Whatever happens next — going round the loop, or running out — is
   * scheduled rather than watched for, so it does not depend on the UI getting
   * a frame. A window nobody is looking at still finishes its song, and still
   * comes round.
   *
   * Each turn of a loop is anchored at its start rather than measured from the
   * last one, so a late timer makes one turn a few milliseconds long rather
   * than walking the loop out of the song.
   */
  private scheduleNext(): void {
    this.clearNextTimer()

    const loop = this.loop
    if (loop !== null) {
      const untilRoundAgain = (loop.end - this.position) / this.rate
      if (untilRoundAgain > 0) {
        this.nextTimer = setTimeout(() => {
          this.nextTimer = null
          /* Restarting schedules the next turn. */
          this.restartSources(loop.start)
        }, untilRoundAgain * 1000)
        return
      }
    }

    if (this.openEnded) return
    const remaining = (this.end - this.position) / this.rate + END_GRACE_S
    if (remaining <= 0) return
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null
      this.onEnded?.()
    }, remaining * 1000)
  }

  private clearNextTimer(): void {
    if (this.nextTimer === null) return
    clearTimeout(this.nextTimer)
    this.nextTimer = null
  }

  /**
   * Brings the graph in line with the song: decodes anything new, drops
   * anything gone, and leaves untouched channels playing.
   */
  /**
   * Decoding takes long enough for a second call to arrive mid-flight, and two
   * running together would each build a node for the same channel and the
   * loser's would be left connected with nothing able to stop it — audible for
   * ever, including after stop. So they queue.
   */
  load(
    song: Song,
    readAudio: (file: string) => Promise<Uint8Array>,
    onProgress?: (decoded: number, total: number) => void
  ): Promise<void> {
    const next = this.loading.then(
      () => this.loadNow(song, readAudio, onProgress),
      () => this.loadNow(song, readAudio, onProgress)
    )
    this.loading = next.catch(() => undefined)
    return next
  }

  private async loadNow(
    song: Song,
    readAudio: (file: string) => Promise<Uint8Array>,
    onProgress?: (decoded: number, total: number) => void
  ): Promise<void> {
    const context = this.ensureContext()
    const wanted = new Map(
      song.channels
        .filter((channel): channel is AudioChannel => channel.kind === 'audio')
        .map((channel) => [channel.id, channel])
    )

    /* Nothing decoded for another song may be kept, whatever it is called.
       Within one song the ids are the same channels, so what is already
       decoded is reused and adding one does not re-read the rest. */
    if (song.id !== this.loadedSongId) {
      for (const loaded of this.channels.values()) this.dropChannel(loaded)
      this.channels.clear()
      this.loadedSongId = song.id
    }

    for (const [id, loaded] of this.channels) {
      if (wanted.has(id)) continue
      this.dropChannel(loaded)
      this.channels.delete(id)
    }

    let decoded = 0
    const total = wanted.size
    onProgress?.(0, total)

    await Promise.all(
      [...wanted.values()].map(async (channel) => {
        const existing = this.channels.get(channel.id)
        if (existing !== undefined) {
          existing.channel = channel
          onProgress?.((decoded += 1), total)
          return
        }
        const bytes = await readAudio(channel.file)
        /* decodeAudioData detaches the buffer, so hand it a copy of its own. */
        const buffer = await context.decodeAudioData(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
        )
        const gain = context.createGain()
        gain.connect(this.musicBus as GainNode)

        /* Nothing should have appeared while decoding, but if it somehow did,
           the new node is thrown away rather than left dangling. */
        if (this.channels.has(channel.id)) {
          gain.disconnect()
          return
        }
        this.channels.set(channel.id, { channel, buffer, gain, source: null })
        onProgress?.((decoded += 1), total)
      })
    )

    this.applyMix(song)
    if (this.playing) this.startAddedChannels()
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

    /* Solved here rather than per beat: the arithmetic does not change between
       one click and the next, only which of them is due. */
    this.metronomes = song.channels
      .filter((channel): channel is MetronomeChannel => channel.kind === 'metronome')
      .map((channel) => ({
        channel: { ...channel, gain: audibleGain(channel, song.channels) },
        timing: solveMetronome(channel)
      }))
  }

  /**
   * Announces that a song is about to be loaded, before the work that finds it
   * has even started. Play waits for this, so pressing play the instant a song
   * is chosen waits rather than running the clock over silence.
   */
  beginLoad(): () => void {
    if (this.awaited === null) {
      let settle!: () => void
      const promise = new Promise<void>((resolve) => {
        settle = resolve
      })
      this.awaited = { promise, settle }
    }
    const mine = this.awaited
    return () => {
      if (this.awaited === mine) this.awaited = null
      mine.settle()
    }
  }

  /**
   * Resolves true once sound is actually running, which is not the same moment
   * as being asked. The first play of a session waits for a WASM module to
   * load, and anything that has to line up with the song — a take above all —
   * has to start then rather than when the button was pressed.
   */
  async play(): Promise<boolean> {
    if (this.playing) return false
    const context = this.ensureContext()

    /*
     * Claim playback before waiting for anything. Getting ready means loading
     * a WASM module and resuming the context, and a stop arriving during that
     * has to win — otherwise it is acted on while nothing is playing yet, and
     * then playback starts anyway with the transport certain it is stopped.
     */
    this.playing = true
    this.starting = true
    this.anchorContext = context.currentTime
    const attempt = (this.playAttempt += 1)

    await this.loadStretch()
    await this.clicksLoading
    /* Whatever song is arriving has to arrive before there is anything to play. */
    await this.awaited?.promise
    await this.loading
    if (context.state === 'suspended') await context.resume()

    this.starting = false
    /* Stopped, paused, or asked to start again while we were getting ready. */
    if (!this.playing || attempt !== this.playAttempt) return false

    /* Starting at the very end would play nothing; go back to the beginning.
       Unless the end is where the recording is meant to go. */
    const from =
      this.anchorSong >= this.end && !this.openEnded ? this.start : this.anchorSong
    this.restartSources(from)
    return true
  }

  pause(): void {
    if (!this.playing) return
    this.playAttempt += 1
    this.starting = false
    this.anchorSong = this.position
    this.playing = false
    this.clearNextTimer()
    this.stopSources()
  }

  stop(): void {
    this.playing = false
    this.playAttempt += 1
    this.starting = false
    this.clearNextTimer()
    this.stopSources()
    this.anchorSong = this.start
  }

  /** Scrubbing must not interrupt playback: the sources restart at the new spot. */
  seek(songTime: number): void {
    if (this.playing) {
      this.restartSources(songTime)
    } else {
      this.anchorSong = this.clampToSong(songTime)
      this.stopSources()
    }
  }

  dispose(): void {
    this.clearNextTimer()
    this.playAttempt += 1
    this.playing = false
    for (const loaded of this.channels.values()) this.dropChannel(loaded)
    this.channels.clear()
    this.loadedSongId = null
    void this.context?.close()
    this.context = null
  }

  private stopSources(): void {
    for (const loaded of this.channels.values()) this.stopChannel(loaded)
    this.stopClicks()
  }

  private stopChannel(loaded: LoadedChannel): void {
    if (loaded.source === null) return
    loaded.source.onended = null
    try {
      loaded.source.stop()
    } catch {
      /* Already stopped. */
    }
    loaded.source.disconnect()
    loaded.source = null
  }

  /** Takes a channel out of the graph entirely, leaving nothing connected. */
  private dropChannel(loaded: LoadedChannel): void {
    this.stopChannel(loaded)
    loaded.gain.disconnect()
  }

  /**
   * Rebuilds every source at a given song time. A source node is single-use,
   * so seeking and resuming both come through here.
   *
   * The time is a parameter rather than read from the clock, because the two
   * callers mean different things by it: resuming means "from where we paused"
   * while seeking means "from there". Inferring it got that wrong — restarting
   * while playing re-anchored to where playback had *begun*, so adding a
   * channel mid-song threw the playhead back to wherever play was pressed.
   */
  private restartSources(atSongTime: number): void {
    const context = this.context
    if (context === null) return

    this.stopSources()
    this.anchorSong = this.clampToSong(atSongTime)
    this.anchorContext = context.currentTime

    for (const loaded of this.channels.values()) {
      this.startChannel(loaded, this.anchorSong)
    }
    this.restartClicks(this.anchorSong)
    if (this.playing) this.scheduleNext()
  }

  /** Clicks already handed over cannot be recalled, so the watermark moves too. */
  private restartClicks(from: number): void {
    this.clicksScheduledTo = from
    if (this.clickTimer !== null) return
    this.clickTimer = setInterval(() => this.scheduleClicks(), CLICK_TICK_MS)
  }

  private stopClicks(): void {
    if (this.clickTimer !== null) {
      clearInterval(this.clickTimer)
      this.clickTimer = null
    }
    /* A click scheduled for a moment that has not arrived would still sound
       after pausing, so it is taken back rather than merely not renewed. */
    for (const source of this.pendingClicks) {
      source.onended = null
      try {
        source.stop()
      } catch {
        /* Already sounded. */
      }
      source.disconnect()
    }
    this.pendingClicks = []
  }

  /**
   * Hands the audio thread every click falling in the next fraction of a
   * second. Timers are far too coarse to fire a click on the beat, so nothing
   * is played *at* the right moment — it is scheduled for it, ahead of time,
   * and the audio clock keeps it.
   */
  private scheduleClicks(): void {
    const context = this.context
    if (context === null || !this.playing || this.starting) return

    const until = Math.min(this.end, this.position + CLICK_HORIZON_S)
    const from = this.clicksScheduledTo
    if (until <= from) return
    this.clicksScheduledTo = until

    for (const { channel, timing } of this.metronomes) {
      if (channel.gain <= 0) continue
      const pair = this.clicks.get(channel.sample)
      if (pair === undefined) continue

      for (const beat of beatsBetween(timing, from, until)) {
        const accent = channel.accentFirstBeat && beat.accent
        const source = context.createBufferSource()
        source.buffer = accent ? pair.accent : pair.beat

        const gain = context.createGain()
        gain.gain.value = channel.gain
        source.connect(gain)
        gain.connect(this.clickBus as GainNode)

        /* Song time to audio time, at whatever rate we are playing. */
        const when =
          this.anchorContext + (beat.time - this.anchorSong) / this.rate
        source.start(Math.max(context.currentTime, when))
        this.pendingClicks.push(source)
        source.onended = () => {
          gain.disconnect()
          this.pendingClicks = this.pendingClicks.filter((entry) => entry !== source)
        }
      }
    }
  }

  /**
   * Brings channels that have just appeared into a performance already under
   * way, leaving the ones already sounding alone. Separating a track adds
   * several at once, and restarting everything to accommodate them would put a
   * hole in the middle of the song.
   */
  private startAddedChannels(): void {
    const at = this.position
    for (const loaded of this.channels.values()) {
      if (loaded.source !== null) continue
      this.startChannel(loaded, at)
    }
    /* A metronome may have arrived too. Only start the scheduler if it is not
       already running: rewinding its watermark would sound the same clicks
       twice. */
    if (this.clickTimer === null) this.restartClicks(at)
    this.scheduleNext()
  }

  /** Starts one channel's source for a given song time, replacing any current one. */
  private startChannel(loaded: LoadedChannel, songTime: number): void {
    const context = this.context
    if (context === null) return

    this.stopChannel(loaded)

    /* Only the kept part of the file is played: trimming says where in the
       file to begin and how much of it to take, and leaves the file alone. */
    const play = playFrom(loaded.channel, songTime)
    if (play === null) return

    const source = context.createBufferSource()
    source.buffer = loaded.buffer
    source.playbackRate.value = this.rate
    source.connect(loaded.gain)

    /* A gap still to come is waited out in wall-clock terms. */
    source.start(context.currentTime + play.wait / this.rate, play.from, play.length)
    loaded.source = source
  }
}

function rampTo(node: GainNode, value: number, context: AudioContext): void {
  node.gain.cancelScheduledValues(context.currentTime)
  node.gain.setTargetAtTime(value, context.currentTime, GAIN_RAMP_S)
}

export const audioEngine = new AudioEngine()
