import { describe, expect, it } from 'vitest'

import { moveNeedle, newNeedle } from './steady'

/**
 * A plucked string is sharp at the moment it is struck and settles as it dies
 * away. A needle that follows every reading swings flat across the life of
 * every note; what a tuner wants is the pitch the string settles on.
 */
describe('the needle', () => {
  const centsApart = (from: number, to: number) => 1200 * Math.log2(to / from)
  const at = (cents: number) => 110 * 2 ** (cents / 1200)

  const feed = (readings: number[], from = newNeedle()) =>
    readings.reduce((needle, reading) => moveNeedle(needle, reading), from)

  const settled = (readings: number[]) => feed(readings)

  it('shows nothing until a pitch has held still', () => {
    expect(moveNeedle(newNeedle(), 110).hz).toBeNull()
    expect(feed(Array(8).fill(110)).hz).toBeNull()
  })

  it('shows a pitch once it has', () => {
    expect(feed(Array(10).fill(110)).hz).toBeCloseTo(110, 4)
  })

  /* The pitch is sliding through the attack, so no run of readings settles. */
  it('stays blank through the slide of a pluck', () => {
    const attack = [14, 12, 10.4, 8.9, 7.6, 6.5, 5.6, 4.8, 4.1, 3.5, 3].map(at)
    expect(feed(attack).hz).toBeNull()
  })

  it('settles on where the string ended up, not where it started', () => {
    const slide = [14, 12, 10.4, 8.9, 7.6, 6.5, 5.6, 4.8, 4.1, 3.5, 3, 2.6].map(at)
    const needle = feed([...slide, ...Array(16).fill(at(0.2))])

    expect(needle.hz).not.toBeNull()
    expect(Math.abs(centsApart(110, needle.hz as number))).toBeLessThan(2)
  })

  /* The whole point: the same string struck again says nothing new. */
  it('does not move when the string is plucked again', () => {
    const holding = feed(Array(12).fill(110))
    const before = holding.hz as number

    const reattack = [13, 11, 9.2, 7.8, 6.6, 5.6, 4.7, 4].map(at)
    const after = feed(reattack, holding).hz as number

    expect(Math.abs(centsApart(before, after))).toBeLessThan(1)
  })

  it('follows a peg once the new pitch has held still', () => {
    const holding = feed(Array(12).fill(110))
    /* Ten readings to believe it, then a few more to arrive: about a second. */
    const turned = feed(Array(20).fill(at(25)), holding)

    expect(Math.abs(centsApart(at(25), turned.hz as number))).toBeLessThan(1)
  })

  it('takes another string the same way, once it has held still', () => {
    const holding = feed(Array(12).fill(110))

    expect(moveNeedle(holding, 146.83).hz).toBeCloseTo(110, 4)
    /* Within a cent of the new string, having taken about a second. */
    const moved = feed(Array(24).fill(146.83), holding).hz as number
    expect(Math.abs(centsApart(146.83, moved))).toBeLessThan(1)
  })

  /* One window hearing an octave is a mistake, not a new string. */
  it('is not moved by a single wild reading', () => {
    const holding = feed(Array(12).fill(110))

    const after = feed([220, 110, 110], holding)

    expect(after.hz).toBeCloseTo(110, 4)
  })

  it('eases across a waver rather than answering it', () => {
    const holding = feed(Array(12).fill(110))
    const shown = [110.15, 109.85, 110.1, 109.9].map((reading) => {
      const next = moveNeedle(holding, reading)
      return next.hz as number
    })

    for (const value of shown) expect(Math.abs(centsApart(110, value))).toBeLessThan(1)
  })
})
