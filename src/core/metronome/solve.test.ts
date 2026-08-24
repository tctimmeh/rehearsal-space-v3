import { describe, expect, it } from 'vitest'

import type { MetronomeChannel, MetronomeDuration } from '../song/song'
import { beatsBetween, solveMetronome } from './solve'

const channel = (
  duration: MetronomeDuration,
  overrides: Partial<MetronomeChannel> = {}
): MetronomeChannel => ({
  kind: 'metronome',
  id: 'click',
  name: 'Count-in',
  subject: 'metronome',
  gain: 0.5,
  muted: false,
  soloed: false,
  sample: 'tick',
  endTime: 0,
  beatsPerMeasure: 4,
  accentFirstBeat: true,
  duration,
  ...overrides
})

const times = (timing: ReturnType<typeof solveMetronome>) =>
  beatsBetween(timing, timing.startTime - 1, timing.endTime + 1).map((beat) =>
    Number(beat.time.toFixed(6))
  )

describe('counting measures back from the end', () => {
  it('puts the last beat so that it finishes on the end, not starts there', () => {
    /* One bar of four at 120bpm: half a second a beat, two seconds in all. */
    const timing = solveMetronome(channel({ mode: 'measures', bpm: 120, measures: 1 }))

    expect(timing.startTime).toBeCloseTo(-2, 10)
    expect(times(timing)).toEqual([-2, -1.5, -1, -0.5])
    /* Nothing lands on the end: that beat's time has been served by then. */
    expect(times(timing)).not.toContain(0)
  })

  it('counts a count-in back from where the band comes in', () => {
    /* Two bars at 100bpm before a song that starts 8 seconds in. */
    const timing = solveMetronome(
      channel({ mode: 'measures', bpm: 100, measures: 2 }, { endTime: 8 })
    )

    expect(timing.beatCount).toBe(8)
    expect(timing.startTime).toBeCloseTo(8 - 8 * 0.6, 10)
    expect(times(timing).at(-1)).toBeCloseTo(8 - 0.6, 10)
  })

  it('is happy to start before the song does', () => {
    const timing = solveMetronome(channel({ mode: 'measures', bpm: 120, measures: 2 }))
    expect(timing.startTime).toBeLessThan(0)
    expect(times(timing)[0]).toBeCloseTo(-4, 10)
  })

  it('takes the tempo it was given, exactly', () => {
    const timing = solveMetronome(channel({ mode: 'measures', bpm: 137, measures: 3 }))
    expect(timing.bpm).toBe(137)
  })

  it('follows the time signature', () => {
    const timing = solveMetronome(
      channel({ mode: 'measures', bpm: 120, measures: 2 }, { beatsPerMeasure: 3 })
    )
    expect(timing.beatCount).toBe(6)
  })
})

describe('fitting between two points found by ear', () => {
  it('lands the first click on the start and the last beat on the end', () => {
    /* Ten seconds at roughly 120bpm: twenty beats fit exactly. */
    const timing = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 120, startTime: 30 }, { endTime: 40 })
    )

    expect(timing.beatCount).toBe(20)
    expect(times(timing)[0]).toBe(30)
    expect(times(timing).at(-1)).toBeCloseTo(40 - timing.beatDuration, 10)
    expect(timing.bpm).toBeCloseTo(120, 10)
  })

  it('nudges the tempo so the clicks cannot drift off the music', () => {
    /* 9.7 seconds at roughly 120bpm is 19.4 beats: nineteen, slightly slower. */
    const timing = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 120, startTime: 0 }, { endTime: 9.7 })
    )

    expect(timing.beatCount).toBe(19)
    expect(timing.bpm).toBeCloseTo(117.526, 3)
    expect(times(timing)[0]).toBe(0)
    expect(timing.startTime + timing.beatCount * timing.beatDuration).toBeCloseTo(9.7, 10)
  })

  it('rounds to the nearer number of beats, either way', () => {
    const slower = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 120, startTime: 0 }, { endTime: 10.2 })
    )
    expect(slower.beatCount).toBe(20)
    expect(slower.bpm).toBeLessThan(120)

    const faster = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 120, startTime: 0 }, { endTime: 9.8 })
    )
    expect(faster.beatCount).toBe(20)
    expect(faster.bpm).toBeGreaterThan(120)
  })

  it('works across zero, for a count-in found by ear', () => {
    const timing = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 90, startTime: -2.5 }, { endTime: 1.5 })
    )

    expect(times(timing)[0]).toBe(-2.5)
    expect(timing.startTime + timing.beatCount * timing.beatDuration).toBeCloseTo(1.5, 10)
  })

  it('gives up rather than dividing by nothing when the span is empty', () => {
    const timing = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 120, startTime: 5 }, { endTime: 5 })
    )
    expect(timing.beatCount).toBe(0)
    expect(times(timing)).toEqual([])
  })

  it('refuses a tempo that is not one', () => {
    const timing = solveMetronome(
      channel({ mode: 'startTime', approxBpm: 0, startTime: 0 }, { endTime: 4 })
    )
    expect(Number.isFinite(timing.bpm)).toBe(true)
    expect(timing.beatCount).toBeGreaterThan(0)
  })
})

describe('accents', () => {
  it('falls on the first beat of each measure', () => {
    const timing = solveMetronome(channel({ mode: 'measures', bpm: 120, measures: 2 }))
    const beats = beatsBetween(timing, timing.startTime - 1, timing.endTime + 1)

    expect(beats.map((beat) => beat.accent)).toEqual([
      true, false, false, false,
      true, false, false, false
    ])
  })

  it('follows an odd time signature', () => {
    const timing = solveMetronome(
      channel({ mode: 'measures', bpm: 120, measures: 2 }, { beatsPerMeasure: 3 })
    )
    const beats = beatsBetween(timing, timing.startTime - 1, timing.endTime + 1)
    expect(beats.filter((beat) => beat.accent)).toHaveLength(2)
  })
})

describe('asking for the beats in a window', () => {
  const timing = solveMetronome(channel({ mode: 'measures', bpm: 120, measures: 4 }, { endTime: 8 }))

  it('returns only what falls inside it', () => {
    const beats = beatsBetween(timing, 1, 2)
    expect(beats.map((beat) => beat.time)).toEqual([1, 1.5])
  })

  it('includes the near edge and excludes the far one, so windows can abut', () => {
    const first = beatsBetween(timing, 1, 1.5).map((beat) => beat.time)
    const second = beatsBetween(timing, 1.5, 2).map((beat) => beat.time)

    expect(first).toEqual([1])
    expect(second).toEqual([1.5])
    /* No beat is scheduled twice, and none is missed. */
    expect([...first, ...second]).toEqual([1, 1.5])
  })

  it('is empty outside the run of clicks', () => {
    expect(beatsBetween(timing, -20, timing.startTime)).toEqual([])
    expect(beatsBetween(timing, timing.endTime, 100)).toEqual([])
  })
})
