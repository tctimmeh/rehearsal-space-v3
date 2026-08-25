import { describe, expect, it } from 'vitest'

import {
  amplitudeToDb,
  decayedLevel,
  isAudible,
  isClipping,
  METER_FLOOR_DB,
  meterFraction
} from './level'

const atDb = (db: number) => 10 ** (db / 20)

describe('meterFraction', () => {
  it('is empty for silence and full for full scale', () => {
    expect(meterFraction(0)).toBe(0)
    expect(meterFraction(1)).toBe(1)
  })

  it('spends half its travel on the top 30 dB, not the top 3', () => {
    expect(meterFraction(atDb(-30))).toBeCloseTo(0.5, 5)
    expect(meterFraction(atDb(-15))).toBeCloseTo(0.75, 5)
  })

  it('stops at the floor rather than going negative', () => {
    expect(meterFraction(atDb(METER_FLOOR_DB))).toBe(0)
    expect(meterFraction(atDb(-90))).toBe(0)
  })

  it('does not overflow when something arrives above full scale', () => {
    expect(meterFraction(1.4)).toBe(1)
  })

  it('reads a negative half-cycle the same as a positive one', () => {
    expect(meterFraction(-0.5)).toBe(meterFraction(0.5))
  })
})

describe('amplitudeToDb', () => {
  it('puts full scale at zero', () => {
    expect(amplitudeToDb(1)).toBe(0)
    expect(amplitudeToDb(0.5)).toBeCloseTo(-6.02, 2)
  })

  it('has somewhere to put silence', () => {
    expect(amplitudeToDb(0)).toBe(Number.NEGATIVE_INFINITY)
  })
})

describe('telling a working device from a dead one', () => {
  it('counts anything above the floor as sound arriving', () => {
    expect(isAudible(atDb(-50))).toBe(true)
    expect(isAudible(atDb(-70))).toBe(false)
    expect(isAudible(0)).toBe(false)
  })

  it('flags full scale as clipping', () => {
    expect(isClipping(1)).toBe(true)
    expect(isClipping(-1)).toBe(true)
    expect(isClipping(0.99)).toBe(false)
  })
})

describe('decayedLevel', () => {
  it('rises the instant sound arrives', () => {
    expect(decayedLevel(0.1, 0.9, 0.016)).toBe(0.9)
  })

  it('falls at a readable rate rather than following each cycle down', () => {
    const after = decayedLevel(1, 0, 1)
    expect(amplitudeToDb(after)).toBeCloseTo(-30, 5)
  })

  it('never falls below what is actually there', () => {
    expect(decayedLevel(1, 0.5, 10)).toBe(0.5)
  })

  it('holds still when no time has passed', () => {
    expect(decayedLevel(0.4, 0, 0)).toBe(0.4)
  })
})
