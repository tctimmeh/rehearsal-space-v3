import { clampBpm } from './solve'

export interface Pulse {
  /** Beats since the metronome was started, counting from zero. */
  index: number
  /** Seconds since it was started. */
  at: number
  /** First beat of a measure. */
  accent: boolean
}

export const BEATS_MIN = 1
export const BEATS_MAX = 16

export const clampBeats = (beats: number): number =>
  Number.isFinite(beats) ? Math.min(BEATS_MAX, Math.max(BEATS_MIN, Math.round(beats))) : 4

const SECONDS_PER_MINUTE = 60

export const beatDuration = (bpm: number): number => SECONDS_PER_MINUTE / clampBpm(bpm)

/**
 * The beats falling in a window, for a metronome that simply keeps going.
 *
 * A song's click track is solved between two fixed points; this one has only a
 * beginning, so beats are counted forward from it. Handing back a window at a
 * time is what lets the clicks be scheduled a little ahead of being heard,
 * which is the only way to get steady timing out of a machine that is also
 * drawing a screen.
 */
export function pulsesBetween(
  bpm: number,
  beatsPerMeasure: number,
  from: number,
  until: number
): Pulse[] {
  const duration = beatDuration(bpm)
  const measure = clampBeats(beatsPerMeasure)
  if (until <= from) return []

  const pulses: Pulse[] = []
  const first = Math.max(0, Math.ceil(from / duration))
  for (let index = first; index * duration < until; index += 1) {
    const at = index * duration
    if (at < from) continue
    pulses.push({ index, at, accent: index % measure === 0 })
  }
  return pulses
}

/** Which beat of the measure an index falls on, counting from one. */
export function beatOfMeasure(index: number, beatsPerMeasure: number): number {
  return (index % clampBeats(beatsPerMeasure)) + 1
}
