import { describe, expect, it } from 'vitest'

import { isShiftNeutral, requestedSemitones, shifterSemitones } from './pitch'

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
})

describe('isShiftNeutral', () => {
  it('is neutral only when the audio would pass through untouched', () => {
    expect(isShiftNeutral(1, pitch(0))).toBe(true)
    expect(isShiftNeutral(1, pitch(0, 1))).toBe(false)
    expect(isShiftNeutral(0.99, pitch(0))).toBe(false)
  })

  it('spots a tempo change that the pitch request happens to cancel', () => {
    /* Double speed already raises everything an octave. If that is what was
       asked for, the resampling has done the whole job and the shifter can
       leave the path. Half speed with the same request is the opposite: it
       needs two octaves of correction, not none. */
    expect(isShiftNeutral(2, pitch(12))).toBe(true)
    expect(shifterSemitones(0.5, pitch(12))).toBeCloseTo(24, 10)
  })
})
