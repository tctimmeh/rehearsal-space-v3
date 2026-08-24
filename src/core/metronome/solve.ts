import type { MetronomeChannel } from '../song/song'

export interface Beat {
  /** Song time of the click. May be negative: a count-in starts before 00:00. */
  time: number
  /** First beat of a measure. */
  accent: boolean
  index: number
}

export interface MetronomeTiming {
  startTime: number
  endTime: number
  /** After nudging, which is not always what was asked for. */
  bpm: number
  beatDuration: number
  beatCount: number
  beatsPerMeasure: number
}

const SECONDS_PER_MINUTE = 60

/** Below this a "click track" is a drone, and above it a blur. */
const MIN_BPM = 20
const MAX_BPM = 400

export const clampBpm = (bpm: number): number =>
  Number.isFinite(bpm) ? Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)) : MIN_BPM

/**
 * Works out when every click falls.
 *
 * Both ends are placed by eye, so the tempo is what gives. The BPM asked for
 * only decides how many beats fit between them; the exact tempo is then
 * whatever divides the span evenly, so the first click lands on the start and
 * the last beat *finishes* on the end. A click that drifts off the music it
 * was lined up against is worse than one a fraction of a BPM from what was
 * typed.
 */
export function solveMetronome(channel: MetronomeChannel): MetronomeTiming {
  const beatsPerMeasure = Math.max(1, Math.round(channel.beatsPerMeasure))
  const { startTime, endTime } = channel
  const span = endTime - startTime

  if (span <= 0) {
    const bpm = clampBpm(channel.bpm)
    return {
      startTime,
      endTime,
      bpm,
      beatDuration: SECONDS_PER_MINUTE / bpm,
      beatCount: 0,
      beatsPerMeasure
    }
  }

  const approxBeat = SECONDS_PER_MINUTE / clampBpm(channel.bpm)
  const beatCount = Math.max(1, Math.round(span / approxBeat))
  const beatDuration = span / beatCount

  return {
    startTime,
    endTime,
    bpm: SECONDS_PER_MINUTE / beatDuration,
    beatDuration,
    beatCount,
    beatsPerMeasure
  }
}

/** The clicks falling in `[from, to)`, for a scheduler working ahead of itself. */
export function beatsBetween(timing: MetronomeTiming, from: number, to: number): Beat[] {
  const { startTime, beatDuration, beatCount, beatsPerMeasure } = timing
  if (beatCount === 0 || beatDuration <= 0) return []

  const first = Math.max(0, Math.ceil((from - startTime) / beatDuration))
  const last = Math.min(beatCount - 1, Math.floor((to - startTime) / beatDuration))

  const beats: Beat[] = []
  for (let index = first; index <= last; index += 1) {
    const time = startTime + index * beatDuration
    /* Only count within the window asked for; ceil can land just below it. */
    if (time < from || time >= to) continue
    beats.push({ time, index, accent: index % beatsPerMeasure === 0 })
  }
  return beats
}
