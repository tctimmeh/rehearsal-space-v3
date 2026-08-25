import { describe, expect, it } from 'vitest'

import { takeStartTime } from './take'

const placement = {
  songTimeAtFirstSample: 30,
  audibleDelay: 0.12,
  inputLatency: 0.02,
  speed: 1,
  earliest: 0
}

describe('takeStartTime', () => {
  it('puts a take earlier than the clock said, by the whole round trip', () => {
    expect(takeStartTime(placement)).toBeCloseTo(30 - 0.14, 6)
  })

  it('counts less song against the same delay when the song is slowed down', () => {
    /* The latencies are seconds in the room; at 80% the song covers 80% as
       much ground in them. */
    expect(takeStartTime({ ...placement, speed: 0.8 })).toBeCloseTo(30 - 0.112, 6)
  })

  it('does not push a take off the front of the song', () => {
    expect(takeStartTime({ ...placement, songTimeAtFirstSample: 0 })).toBe(0)
  })

  it('respects a timeline that starts before zero', () => {
    expect(
      takeStartTime({ ...placement, songTimeAtFirstSample: -4, earliest: -8 })
    ).toBeCloseTo(-4.14, 6)
  })

  it('is exactly the clock when nothing is delayed', () => {
    expect(
      takeStartTime({ ...placement, audibleDelay: 0, inputLatency: 0 })
    ).toBe(30)
  })
})
