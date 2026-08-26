import { describe, expect, it } from 'vitest'

import { addReading, glideHz, steadyHz } from './steady'

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

/**
 * A plucked note is never quite still, and a needle that answers every flicker
 * of it cannot be tuned against.
 */
describe('easing the needle', () => {
  const cents = (from: number, to: number) => 1200 * Math.log2(to / from)

  it('starts wherever the first reading is', () => {
    expect(glideHz(null, 110)).toBe(110)
  })

  it('moves part of the way toward a reading, not all of it', () => {
    const moved = glideHz(110, 111)

    expect(moved).toBeGreaterThan(110)
    expect(moved).toBeLessThan(111)
  })

  it('gets there in the end', () => {
    let shown = 110
    for (let reading = 0; reading < 40; reading += 1) shown = glideHz(shown, 111)

    expect(cents(shown, 111)).toBeCloseTo(0, 1)
  })

  it('follows a peg being turned inside a second', () => {
    /* Readings arrive twenty a second, so twenty of them is one second, and
       110 to 112 is a move of about thirty cents. */
    let shown = 110
    for (let reading = 0; reading < 20; reading += 1) shown = glideHz(shown, 112)

    expect(Math.abs(cents(shown, 112))).toBeLessThan(2)
  })

  it('is still well short after one reading, which is the point of it', () => {
    const moved = glideHz(110, 112)

    expect(Math.abs(cents(moved, 112))).toBeGreaterThan(10)
  })

  it('smooths a wavering string more than it delays it', () => {
    const wobble = [110, 110.4, 109.7, 110.3, 109.8, 110.2, 109.9]
    let shown: number | null = null
    const shownAt = wobble.map((reading) => (shown = glideHz(shown, reading)))

    const spread = (values: number[]) => Math.max(...values) - Math.min(...values)
    expect(spread(shownAt.slice(1))).toBeLessThan(spread(wobble) / 2)
  })

  it('goes at once when the string has been changed rather than wavered', () => {
    /* A whole tone away is a different note, not a wobble. */
    expect(glideHz(110, 123.47)).toBe(123.47)
  })

  it('never drifts the wrong way', () => {
    expect(glideHz(110, 109)).toBeLessThan(110)
    expect(glideHz(110, 111)).toBeGreaterThan(110)
  })
})
