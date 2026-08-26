import { describe, expect, it } from 'vitest'

import { moveNeedle, newNeedle, type Heard, type Needle } from './steady'

const at = (cents: number) => 110 * 2 ** (cents / 1200)
const off = (hz: number) => 1200 * Math.log2(hz / 110)

/** A reading of a note that is well under way: clear, and quietly decaying. */
const quietly = (cents: number, level = 0.01): Heard => ({
  frequency: at(cents),
  clarity: 1,
  level
})

const feed = (heard: Heard[], from: Needle = newNeedle()) =>
  heard.reduce((needle, one) => moveNeedle(needle, one), from)

const held = (cents: number, howMany = 10) =>
  Array.from({ length: howMany }, () => quietly(cents))

describe('a string being listened to', () => {
  it('is shown as soon as it has been heard', () => {
    expect(feed(held(0, 1)).hz).toBeCloseTo(110, 5)
  })

  it('sits where it actually is', () => {
    expect(off(feed(held(-7)).hz as number)).toBeCloseTo(-7, 1)
  })

  it('does not move while it is held', () => {
    const settled = feed(held(3))
    const later = feed(held(3), settled)

    expect(later.hz).toBe(settled.hz)
  })

  /* The old design had a deadband, and it read in tune while the string was
     three cents flat. Small is exactly the range a tuner is used in. */
  it('follows a change too small to argue about', () => {
    const settled = feed(held(0))
    const nudged = feed(held(2), settled)

    expect(off(nudged.hz as number)).toBeCloseTo(2, 1)
  })

  it('follows a peg without waiting for it to stop', () => {
    const settled = feed(held(0))
    const wound = feed(
      Array.from({ length: 6 }, (_, step) => quietly(3 + step * 3)),
      settled
    )

    expect(off(wound.hz as number)).toBeGreaterThan(9)
  })
})

describe('a reading not worth having', () => {
  it('is ignored when the window was not periodic enough', () => {
    const settled = feed(held(0))
    const muddled = feed([{ frequency: at(300), clarity: 0.4, level: 0.01 }], settled)

    expect(muddled.hz).toBe(settled.hz)
  })

  it('is ignored when there was no pitch at all', () => {
    const settled = feed(held(0))
    const silent = feed([{ frequency: null, clarity: 0, level: 0.0001 }], settled)

    expect(silent.hz).toBe(settled.hz)
  })

  it('is outvoted when it is a single wild one', () => {
    const settled = feed(held(0))
    const stray = feed([quietly(400), ...held(0, 2)], settled)

    expect(off(stray.hz as number)).toBeCloseTo(0, 1)
  })
})

/**
 * A plucked string is sharp when struck and settles as it dies away — ten
 * cents on a low E, most of it gone within a second. Showing that is honest
 * and useless; the pitch it settles on is the one being asked for.
 */
describe('the attack of a pluck', () => {
  /* A low E, from the recordings: struck loudly and sharp, decaying to pitch. */
  const pluck = (settlesOn: number) =>
    Array.from({ length: 30 }, (_, step) => ({
      frequency: at(settlesOn + 11 * Math.exp(-step / 7)),
      clarity: 1,
      level: 0.06 * Math.exp(-step / 9)
    }))

  it('is not shown', () => {
    const struck = feed(pluck(0).slice(0, 8))

    expect(struck.hz).toBeNull()
  })

  it('gives way to the pitch the string settles on', () => {
    expect(off(feed(pluck(0)).hz as number)).toBeCloseTo(0, 0)
  })

  it('does not drag a needle that already had the string', () => {
    const settled = feed(held(0))
    const replucked = feed(pluck(0).slice(0, 8), settled)

    expect(Math.abs(off(replucked.hz as number))).toBeLessThan(1)
  })
})

describe('a note that never dies away', () => {
  /* Bowed, or a string struck again before the last had faded. Waiting for a
     decay that never comes would leave the needle stale. */
  const sustained = (cents: number, howMany: number) =>
    Array.from({ length: howMany }, () => quietly(cents, 0.06))

  it('is read anyway, once it has gone on long enough', () => {
    expect(feed(sustained(5, 30)).hz).not.toBeNull()
  })

  it('is not read straight away', () => {
    expect(feed(sustained(5, 6)).hz).toBeNull()
  })
})
