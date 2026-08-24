import { describe, expect, it } from 'vitest'

import { requestedSemitones, shifterSemitones } from './pitch'

const pitch = (semitones: number, cents = 0) => ({ semitones, cents })

describe('requestedSemitones', () => {
  it('folds cents into the semitone count', () => {
    expect(requestedSemitones(pitch(2, 50))).toBe(2.5)
    expect(requestedSemitones(pitch(-1, -25))).toBe(-1.25)
  })
})

describe('shifterSemitones', () => {
  it('does nothing when nothing is asked of it', () => {
    expect(shifterSemitones(1, pitch(0))).toBe(0)
  })

  it('passes a pitch change straight through at normal speed', () => {
    expect(shifterSemitones(1, pitch(3))).toBe(3)
    expect(shifterSemitones(1, pitch(-2, -25))).toBe(-2.25)
  })

  it('cancels the pitch that changing tempo causes', () => {
    /* Half speed drops everything an octave; the shifter puts it back. */
    expect(shifterSemitones(0.5, pitch(0))).toBeCloseTo(12, 10)
    expect(shifterSemitones(2, pitch(0))).toBeCloseTo(-12, 10)
    expect(shifterSemitones(0.8, pitch(0))).toBeCloseTo(3.863, 3)
  })

  it('keeps the two controls independent when both are used', () => {
    /* Slower and a tone up: the correction and the request simply add. */
    const both = shifterSemitones(0.8, pitch(2))
    expect(both).toBeCloseTo(shifterSemitones(0.8, pitch(0)) + 2, 10)
  })

  it('is symmetric, so returning the tempo returns the pitch', () => {
    expect(shifterSemitones(1.25, pitch(0)) + shifterSemitones(0.8, pitch(0))).toBeCloseTo(0, 10)
  })

  it('asks for nothing when the tempo change is exactly what was wanted', () => {
    /* Double speed already raises everything an octave. */
    expect(shifterSemitones(2, pitch(12))).toBeCloseTo(0, 10)
    /* Half speed with the same request needs two octaves, not none. */
    expect(shifterSemitones(0.5, pitch(12))).toBeCloseTo(24, 10)
  })
})
