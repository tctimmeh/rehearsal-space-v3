import {
  beatDuration,
  clampBeats,
  countAfterChange,
  pulsesBetween,
  type Pulse
} from '@core/metronome/pulse'
import type { MetronomeSettings } from '@shared/config'
import { audioEngine } from './engine'

/** Far enough ahead to survive a busy frame, near enough to answer a change. */
const HORIZON_S = 0.2
const TICK_MS = 25

export type BeatListener = (pulse: Pulse) => void

interface Scheduled {
  source: AudioBufferSourceNode
  at: number
}

/**
 * The stand-alone metronome: a click that keeps going on its own, with no song
 * behind it and no timeline to belong to.
 *
 * Beats are scheduled a fraction ahead of being heard rather than fired from a
 * timer, because a timer in a browser is at the mercy of whatever else the
 * page is doing. What it hands to the display is when each beat *will* sound,
 * so the light and the click agree.
 */
export class StandaloneMetronome {
  private settings: MetronomeSettings | null = null
  private startedAt = 0
  private scheduledTo = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private scheduled: Scheduled[] = []
  /** Beats counted before the current anchor, so a change does not restart it. */
  private beatsBefore = 0
  private listeners = new Set<BeatListener>()
  /** Claimed before waiting for the samples, so a stop during that wins. */
  private attempt = 0

  /** The clock every beat is timed against. */
  get clock(): AudioContext {
    return audioEngine.audioContext
  }

  get running(): boolean {
    return this.timer !== null
  }

  listen(listener: BeatListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async start(settings: MetronomeSettings): Promise<void> {
    this.stop()
    const mine = (this.attempt += 1)
    this.settings = settings

    /* On a cold app the samples are still arriving. Starting without them
       would count out the first beats in silence. */
    await audioEngine.clicksReady()
    if (mine !== this.attempt) return

    const context = audioEngine.audioContext
    /* A beat lands on the moment start was pressed, as near as the graph can
       manage, rather than a beat-length later. */
    this.startedAt = context.currentTime
    this.scheduledTo = 0
    this.beatsBefore = 0
    this.timer = setInterval(() => this.schedule(), TICK_MS)
    this.schedule()
  }

  /**
   * A change while running takes effect from the next beat, and the count
   * carries on: this is a thing to play along to, so it must not go back to
   * beat one because the tempo was nudged or the sound was changed.
   */
  update(settings: MetronomeSettings): void {
    const previous = this.settings
    if (this.timer === null || previous === null) {
      this.settings = settings
      return
    }
    const context = audioEngine.audioContext
    const spacing = beatDuration(previous.bpm)
    const beatsGone = Math.ceil((context.currentTime - this.startedAt) / spacing)

    this.dropUnsounded()
    this.beatsBefore = countAfterChange(
      this.beatsBefore,
      beatsGone,
      clampBeats(settings.beatsPerMeasure) !== clampBeats(previous.beatsPerMeasure)
    )
    this.settings = settings
    this.startedAt = this.startedAt + beatsGone * spacing
    this.scheduledTo = 0
    this.schedule()
  }

  /**
   * Takes the tempo from a tap and puts the beat where the tapping was.
   *
   * Setting the tempo alone would leave the clicks landing between the taps
   * that produced them, which is what makes a tap tempo feel broken. The count
   * starts again from the last tap for the same reason: what was just tapped
   * out is the new one.
   */
  tapTo(settings: MetronomeSettings, anchorAt: number): void {
    this.settings = settings
    if (this.timer === null) return

    this.dropUnsounded()
    this.startedAt = anchorAt
    this.beatsBefore = 0
    /* The tap is already in the past. Without this every beat since would be
       scheduled at once, all landing on the same instant. */
    this.scheduledTo = Math.max(0, audioEngine.audioContext.currentTime - anchorAt)
    this.schedule()
  }

  stop(): void {
    this.attempt += 1
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    this.dropUnsounded()
    this.scheduledTo = 0
  }

  /** Only beats that have not been heard yet: cutting one mid-click is audible. */
  private dropUnsounded(): void {
    const now = audioEngine.audioContext.currentTime
    for (const entry of this.scheduled) {
      if (entry.at <= now) continue
      try {
        entry.source.stop()
      } catch {
        /* Already done with. */
      }
    }
    this.scheduled = this.scheduled.filter((entry) => entry.at <= now)
  }

  private schedule(): void {
    const settings = this.settings
    if (settings === null || this.timer === null) return

    const elapsed = audioEngine.audioContext.currentTime - this.startedAt
    const until = elapsed + HORIZON_S
    if (until <= this.scheduledTo) return

    for (const pulse of pulsesBetween(
      settings.bpm,
      settings.beatsPerMeasure,
      this.scheduledTo,
      until
    )) {
      this.sound(pulse, settings)
    }
    this.scheduledTo = until
  }

  private sound(pulse: Pulse, settings: MetronomeSettings): void {
    const context = audioEngine.audioContext
    const index = this.beatsBefore + pulse.index
    const onDownbeat = index % clampBeats(settings.beatsPerMeasure) === 0
    const accent = settings.accentFirstBeat && onDownbeat
    const sample = audioEngine.clickSample(settings.sample, accent)
    const at = Math.max(context.currentTime, this.startedAt + pulse.at)

    if (sample !== undefined) {
      const source = context.createBufferSource()
      source.buffer = sample
      source.connect(audioEngine.clickDestination)
      source.start(at)
      const entry = { source, at }
      this.scheduled.push(entry)
      source.onended = () => {
        this.scheduled = this.scheduled.filter((each) => each !== entry)
      }
    }

    for (const listener of [...this.listeners]) {
      listener({ index, at, accent: onDownbeat })
    }
  }
}

export const standaloneMetronome = new StandaloneMetronome()
