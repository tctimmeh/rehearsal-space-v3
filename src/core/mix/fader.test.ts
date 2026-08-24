import { describe, expect, it } from 'vitest'

import { faderToGain, gainToDb, gainToFader } from './fader'

const db = (gain: number): number => 20 * Math.log10(gain)

describe('the fader taper', () => {
  it('puts unity at the top and silence at the bottom', () => {
    expect(faderToGain(1)).toBe(1)
    expect(faderToGain(0)).toBe(0)
  })

  it('never boosts, however hard it is pushed', () => {
    expect(faderToGain(1.5)).toBe(1)
    expect(faderToGain(-1)).toBe(0)
  })

  it('changes loudness at a steady rate the whole way down', () => {
    /* The point of the taper: a centimetre of travel is worth the same number
       of decibels near the top as it is near the bottom. Straight amplitude
       would put half-way at -6 dB and squeeze the rest into the bottom half. */
    const steps = [1, 0.75, 0.5, 0.25].map((position) => db(faderToGain(position)))
    const drops = steps.slice(1).map((value, index) => (steps[index] as number) - value)
    for (const drop of drops) expect(drop).toBeCloseTo(12, 5)
  })

  it('gives the useful range the top of the fader', () => {
    expect(db(faderToGain(0.5))).toBeCloseTo(-24, 5)
    expect(db(faderToGain(0.75))).toBeCloseTo(-12, 5)
  })

  it('round-trips a gain back to the same place on the fader', () => {
    for (const gain of [0, 0.01, 0.25, 0.5, 0.8, 1]) {
      expect(faderToGain(gainToFader(gain))).toBeCloseTo(gain, 6)
    }
  })

  it('reads anything below the floor as off, rather than pinning it just above', () => {
    /* -60 dB is inaudible; the fader has no room to show the difference. */
    expect(gainToFader(0.001)).toBe(0)
    expect(faderToGain(gainToFader(0.001))).toBe(0)
  })

  it('only ever moves one way', () => {
    let previous = -1
    for (let position = 0; position <= 1; position += 0.05) {
      const gain = faderToGain(position)
      expect(gain).toBeGreaterThanOrEqual(previous)
      previous = gain
    }
  })
})

describe('gainToDb', () => {
  it('reads unity as zero', () => {
    expect(gainToDb(1)).toBe('0.0 dB')
  })

  it('uses a proper minus sign, to match the rest of the app', () => {
    expect(gainToDb(0.5)).toBe('−6.0 dB')
  })

  it('says infinity rather than a very large number', () => {
    expect(gainToDb(0)).toBe('−∞ dB')
  })
})
