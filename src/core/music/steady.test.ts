import { describe, expect, it } from 'vitest'

import { moveNeedle, newNeedle } from './steady'

/**
 * A plucked string is sharp at the moment it is struck and settles as it dies
 * away, and its readings scatter by a few cents throughout. The needle has to
 * hold still through both without ever refusing to show anything.
 */
describe('the needle', () => {
  const centsApart = (from: number, to: number) => 1200 * Math.log2(to / from)
  const at = (cents: number) => 110 * 2 ** (cents / 1200)

  const feed = (readings: number[], from = newNeedle()) =>
    readings.reduce((needle, reading) => moveNeedle(needle, reading), from)

  /* What a real detector hands over: the pitch, give or take a few cents. */
  let seed = 7
  const scatter = (cents: number, howMany: number, spread = 3): number[] =>
    Array.from({ length: howMany }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return at(cents + ((seed / 2147483648) * 2 - 1) * spread)
    })

  const slide = (from: number, to: number, howMany: number): number[] =>
    Array.from({ length: howMany }, (_, step) =>
      at(from + ((to - from) * step) / (howMany - 1))
    )

  it('shows nothing until it has heard enough to judge', () => {
    expect(moveNeedle(newNeedle(), 110).hz).toBeNull()
    expect(feed(scatter(0, 6)).hz).toBeNull()
  })

  /**
   * The failure that made this necessary: real readings never agree closely,
   * so a rule that asked them to left the tuner blank in front of a guitar.
   */
  it('settles on a note whose readings scatter, which every real one does', () => {
    const needle = feed(scatter(0, 40))

    expect(needle.hz).not.toBeNull()
    expect(Math.abs(centsApart(110, needle.hz as number))).toBeLessThan(2)
  })

  it('settles even when the scatter is wide', () => {
    const needle = feed(scatter(0, 40, 8))

    expect(needle.hz).not.toBeNull()
    expect(Math.abs(centsApart(110, needle.hz as number))).toBeLessThan(4)
  })

  /* The attack is steep, and going nowhere anybody wants the needle to go. */
  it('does not chase the steep part of an attack', () => {
    const holding = feed(scatter(0, 40))
    const before = holding.hz as number

    const after = feed(slide(14, 8, 6), holding).hz as number

    expect(Math.abs(centsApart(before, after))).toBeLessThan(1.5)
  })

  it('ends on the pitch the string settles at, not the one it started from', () => {
    const pluck = [...slide(14, 3, 12), ...scatter(0, 40)]

    const needle = feed(pluck)

    expect(Math.abs(centsApart(110, needle.hz as number))).toBeLessThan(2)
  })

  it('follows a peg once the turning has stopped', () => {
    const holding = feed(scatter(0, 40))

    const turned = feed([...slide(0, 25, 10), ...scatter(25, 45)], holding)

    expect(Math.abs(centsApart(at(25), turned.hz as number))).toBeLessThan(3)
  })

  it('takes another string the same way', () => {
    const holding = feed(scatter(0, 40))
    /* A window to be sure of it, then a moment to travel: about two seconds. */
    const moved = feed(
      Array.from({ length: 40 }, () => 146.83),
      holding
    ).hz as number

    expect(Math.abs(centsApart(146.83, moved))).toBeLessThan(2)
  })

  it('is not moved by a single wild reading', () => {
    const holding = feed(scatter(0, 40))
    const before = holding.hz as number

    const after = feed([220, ...scatter(0, 3)], holding).hz as number

    expect(Math.abs(centsApart(before, after))).toBeLessThan(2)
  })

  /* Nothing should leave a tuner blank in front of somebody holding a guitar. */
  it('shows something even for a note that never settles', () => {
    /* Three seconds of it — the longest the tuner may stay blank. */
    const wandering = Array.from({ length: 60 }, (_, step) => at(step * 1.5))

    expect(feed(wandering).hz).not.toBeNull()
  })
})

/**
 * Both halves of the same promise: never blank in front of a guitar, and never
 * dragged through the slide of an attack once there is something to look at.
 */
describe('a note that will not settle', () => {
  const at = (cents: number) => 110 * 2 ** (cents / 1200)
  const feed = (readings: number[], from = newNeedle()) =>
    readings.reduce((needle, reading) => moveNeedle(needle, reading), from)
  const wandering = (howMany: number, from = 0) =>
    Array.from({ length: howMany }, (_, step) => at(from + step * 1.5))

  it('is shown anyway when there is nothing else to show', () => {
    expect(feed(wandering(60)).hz).not.toBeNull()
  })

  it('keeps up to date even so, rather than sticking on an old reading', () => {
    let seed = 5
    const scatter = (howMany: number, around: number) =>
      Array.from({ length: howMany }, () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return at(around + ((seed / 2147483648) * 2 - 1) * 9)
      })

    /* Readings too wild to settle on, around a pitch that then changes. */
    const holding = feed(scatter(60, 0))
    const after = feed(scatter(60, 40), holding).hz as number

    expect(Math.abs(1200 * Math.log2(after / at(40)))).toBeLessThan(12)
  })

  it('is not disturbed by a note that is merely restless', () => {
    let seed = 3
    const scatter = (howMany: number) =>
      Array.from({ length: howMany }, () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return at(((seed / 2147483648) * 2 - 1) * 3)
      })

    const holding = feed(scatter(40))
    const before = holding.hz as number

    /* Wandering, but never far from where it started. */
    const restless = Array.from({ length: 40 }, (_, step) => at(7 * Math.sin(step / 2)))
    const after = feed(restless, holding).hz as number

    expect(Math.abs(1200 * Math.log2(after / before))).toBeLessThan(3)
  })

  /* The other half of the bargain: a string that plainly moved is followed at
     once, rather than waiting out a window that exists to settle arguments. */
  it('follows a peg without waiting', () => {
    const holding = feed(Array.from({ length: 40 }, () => at(0)))

    /* Twelve readings — six tenths of a second — into a wind of three cents a
       reading, while a window long enough to settle an argument is still
       filling. */
    const wind = Array.from({ length: 12 }, (_, step) => at(4 + step * 3))
    const turning = feed(wind, holding)

    expect(1200 * Math.log2((turning.hz as number) / 110)).toBeGreaterThan(10)
  })
})

/**
 * The moment a string is struck, the detector throws out anything from a
 * semitone sharp to a semitone flat. Those readings sit either side of the
 * truth, so the halves of the window agree perfectly well while the note is
 * still miles out — which is exactly how an earlier attempt at this came to
 * believe a pitch twelve cents sharp.
 */
describe('the chaos of a pluck', () => {
  const at = (cents: number) => 110 * 2 ** (cents / 1200)
  const feed = (readings: number[], from = newNeedle()) =>
    readings.reduce((needle, reading) => moveNeedle(needle, reading), from)

  /* Taken from a real trace of the detector across the attack of a note. */
  const attack = [
    14.9, -4.1, 11.9, 25.5, 18.2, 24.3, 12.1, 10.2, 18.9, 19.4, 15.6, 4.6, -1.0, -2.4, 12.5,
    11.5, 39.2, 17.2, 14.2, 13.6, 12.0, 10.4, 9.0, 8.3
  ].map(at)

  let seed = 19
  const scatter = (cents: number, howMany: number) =>
    Array.from({ length: howMany }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return at(cents + ((seed / 2147483648) * 2 - 1) * 3)
    })

  it('believes none of it', () => {
    const holding = feed(scatter(0, 40))
    const before = holding.hz as number

    const after = feed(attack, holding).hz as number

    expect(Math.abs(1200 * Math.log2(after / before))).toBeLessThan(2)
  })

  it('believes what the string settles at afterwards', () => {
    const holding = feed(scatter(0, 40))
    const after = feed([...attack, ...scatter(0, 40)], holding).hz as number

    expect(Math.abs(1200 * Math.log2(after / 110))).toBeLessThan(2)
  })
})

/**
 * A tuner is used with a hand on a peg, and a hand on a peg wants the needle
 * now, not once the tuner has finished deliberating.
 */
describe('a string being wound', () => {
  const at = (cents: number) => 110 * 2 ** (cents / 1200)
  const cents = (hz: number) => 1200 * Math.log2(hz / 110)
  const feed = (readings: number[], from = newNeedle()) =>
    readings.reduce((needle, reading) => moveNeedle(needle, reading), from)

  const settledAt = (pitch: number) => feed(Array.from({ length: 40 }, () => at(pitch)))
  const wind = (from: number, per: number, howMany: number) =>
    Array.from({ length: howMany }, (_, step) => at(from + step * per))

  it('is followed while it moves, not after it stops', () => {
    const turning = feed(wind(4, 3, 20), settledAt(0))

    /* Twenty readings in, the string is at 61 cents. */
    expect(cents(turning.hz as number)).toBeGreaterThan(45)
  })

  it('is settled on almost as soon as the hand comes off', () => {
    const wound = feed(wind(4, 3, 20), settledAt(0))
    const held = feed(Array.from({ length: 8 }, () => at(61)), wound)

    expect(Math.abs(cents(held.hz as number) - 61)).toBeLessThan(2)
  })

  it('goes back to deliberating once the string has arrived', () => {
    const wound = feed(wind(4, 3, 20), settledAt(0))
    const held = feed(Array.from({ length: 8 }, () => at(61)), wound)

    expect(held.chasing).toBe(false)
  })
})
