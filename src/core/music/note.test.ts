import { describe, expect, it } from 'vitest'

import { A4_HZ, isInTune, midiToFrequency, noteFromFrequency } from './note'

const at = (hz: number) => noteFromFrequency(hz)

describe('noteFromFrequency', () => {
  it('knows concert pitch when it hears it', () => {
    expect(at(A4_HZ)).toMatchObject({ name: 'A', octave: 4, midi: 69 })
    expect(at(A4_HZ)?.cents).toBeCloseTo(0, 6)
  })

  it('names the open strings of a guitar', () => {
    expect(at(82.41)).toMatchObject({ name: 'E', octave: 2 })
    expect(at(110)).toMatchObject({ name: 'A', octave: 2 })
    expect(at(146.83)).toMatchObject({ name: 'D', octave: 3 })
    expect(at(196)).toMatchObject({ name: 'G', octave: 3 })
    expect(at(246.94)).toMatchObject({ name: 'B', octave: 3 })
    expect(at(329.63)).toMatchObject({ name: 'E', octave: 4 })
  })

  it('turns the octave over at C, not at A', () => {
    expect(at(261.63)).toMatchObject({ name: 'C', octave: 4 })
    expect(at(246.94)).toMatchObject({ name: 'B', octave: 3 })
  })

  it('says how far off, and which way', () => {
    expect(at(445)?.cents).toBeCloseTo(19.56, 1)
    expect(at(435)?.cents).toBeCloseTo(-19.78, 1)
  })

  it('never reports more than half a semitone out, since another note is nearer', () => {
    for (let hz = 80; hz < 900; hz += 0.37) {
      expect(Math.abs(at(hz)?.cents ?? 99)).toBeLessThanOrEqual(50.0001)
    }
  })

  it('gives the pitch being aimed at, for something to pull towards', () => {
    expect(at(445)?.idealHz).toBeCloseTo(440, 6)
  })

  it('says nothing about a frequency that is not one', () => {
    expect(at(0)).toBeNull()
    expect(at(-100)).toBeNull()
    expect(at(Number.NaN)).toBeNull()
  })

  it('follows a different concert pitch when asked', () => {
    expect(noteFromFrequency(432, 432)?.cents).toBeCloseTo(0, 6)
    expect(noteFromFrequency(440, 432)?.cents).toBeCloseTo(31.77, 1)
  })
})

describe('midiToFrequency', () => {
  it('is the other direction of the same thing', () => {
    expect(midiToFrequency(69)).toBe(440)
    expect(midiToFrequency(81)).toBeCloseTo(880, 6)
    expect(midiToFrequency(40)).toBeCloseTo(82.41, 2)
  })
})

describe('isInTune', () => {
  it('allows what nobody can hear', () => {
    expect(isInTune(4)).toBe(true)
    expect(isInTune(-5)).toBe(true)
    expect(isInTune(6)).toBe(false)
  })
})
