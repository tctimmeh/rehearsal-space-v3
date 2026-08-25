import { describe, expect, it } from 'vitest'

import { addReading, steadyHz } from './steady'

const runOf = (...values: number[]) => values.reduce<number[]>(addReading, [])

describe('steadying a reading', () => {
  it('says nothing before anything has been heard', () => {
    expect(steadyHz([])).toBeNull()
  })

  it('answers with the one reading there is', () => {
    expect(steadyHz(runOf(110))).toBe(110)
  })

  it('settles a wavering string', () => {
    expect(steadyHz(runOf(109.8, 110.1, 110, 109.9, 110.2))).toBeCloseTo(110, 6)
  })

  it('ignores a window that heard an octave up', () => {
    /* An average would land near 154, which is not a note anybody played. */
    expect(steadyHz(runOf(110, 110, 220, 110, 110))).toBe(110)
  })

  it('follows a peg being turned rather than holding on to the old pitch', () => {
    const turning = runOf(110, 111, 113, 116, 119, 122, 125)
    expect(steadyHz(turning)).toBeGreaterThan(115)
  })

  it('remembers only the recent past', () => {
    expect(runOf(1, 2, 3, 4, 5, 6, 7)).toEqual([3, 4, 5, 6, 7])
  })
})
