import { describe, expect, it } from 'vitest'

import { placeTake, trimHead } from './take'

const placement = {
  songTimeAtFirstSample: 30,
  audibleDelay: 0.12,
  inputLatency: 0.02,
  speed: 1,
  earliest: 0
}

describe('placeTake', () => {
  it('puts a take earlier than the clock said, by the whole round trip', () => {
    expect(placeTake(placement).startTime).toBeCloseTo(30 - 0.14, 6)
    expect(placeTake(placement).trimSeconds).toBe(0)
  })

  it('counts less song against the same delay when the song is slowed down', () => {
    /* The latencies are seconds in the room; at 80% the song covers 80% as
       much ground in them. */
    expect(placeTake({ ...placement, speed: 0.8 }).startTime).toBeCloseTo(30 - 0.112, 6)
  })

  it('is exactly the clock when nothing is delayed', () => {
    expect(placeTake({ ...placement, audibleDelay: 0, inputLatency: 0 }).startTime).toBe(30)
  })

  it('respects a timeline that starts before zero', () => {
    expect(
      placeTake({ ...placement, songTimeAtFirstSample: -4, earliest: -8 }).startTime
    ).toBeCloseTo(-4.14, 6)
  })
})

/**
 * Recording from the top used to come back late by the whole round trip: the
 * take wanted to start before 00:00, was clamped to it, and every note in it
 * moved that far later. Measured against a real pair of takes of the same
 * clapping, one from 00:00 and one from mid-song, the gap was 200 ms.
 */
describe('a take that starts at the top of the song', () => {
  const fromTheTop = { ...placement, songTimeAtFirstSample: 0.005 }

  it('does not push the performance later to make room for the latency', () => {
    expect(placeTake(fromTheTop).startTime).toBe(0)
    expect(placeTake(fromTheTop).trimSeconds).toBeCloseTo(0.135, 6)
  })

  it('drops exactly what would have sat before the song was audible', () => {
    const { startTime, trimSeconds } = placeTake(fromTheTop)
    /* Where the kept audio lands is where it was played, either way round. */
    expect(startTime - trimSeconds).toBeCloseTo(0.005 - 0.14, 6)
  })

  it('measures the trim in the take own seconds, not the song ones', () => {
    expect(placeTake({ ...fromTheTop, speed: 0.5 }).trimSeconds).toBeCloseTo(0.13, 6)
  })
})

describe('trimHead', () => {
  const channel = () => Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  it('drops the samples the head covers', () => {
    const [kept] = trimHead([channel()], 0.3, 10)
    expect([...(kept ?? [])]).toEqual([4, 5, 6, 7, 8, 9, 10])
  })

  it('leaves a take alone when there is nothing to drop', () => {
    expect([...(trimHead([channel()], 0, 10)[0] ?? [])]).toHaveLength(10)
  })

  it('trims every channel by the same amount', () => {
    const trimmed = trimHead([channel(), channel()], 0.2, 10)
    expect(trimmed.map((each) => each.length)).toEqual([8, 8])
  })

  it('comes back empty rather than negative when the take is shorter than the trim', () => {
    expect(trimHead([channel()], 5, 10)[0]).toHaveLength(0)
  })
})
