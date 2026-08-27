import { describe, expect, it } from 'vitest'

import { DEFAULT_NEEDLE, moveNeedle, newNeedle, type Heard, type Needle } from './steady'

const at = (cents: number) => 110 * 2 ** (cents / 1200)
const off = (hz: number) => 1200 * Math.log2(hz / 110)

/** A clean reading of one string, which is what the detector mostly gives. */
const clear = (cents: number): Heard => ({ frequency: at(cents), clarity: 1, level: 0.02 })

const feed = (heard: Heard[], from: Needle = newNeedle(), settings = DEFAULT_NEEDLE) =>
  heard.reduce((needle, one) => moveNeedle(needle, one, settings), from)

const held = (cents: number, howMany = DEFAULT_NEEDLE.readings) =>
  Array.from({ length: howMany }, () => clear(cents))

describe('a string being listened to', () => {
  it('is shown as soon as it has been heard', () => {
    expect(feed(held(0, 1)).hz).toBeCloseTo(110, 5)
  })

  it('sits where it actually is', () => {
    expect(off(feed(held(-7)).hz as number)).toBeCloseTo(-7, 1)
  })

  it('does not move while it is held', () => {
    const settled = feed(held(3))

    expect(feed(held(3), settled).hz).toBe(settled.hz)
  })

  /* An earlier design had a deadband, and read in tune while the string was
     three cents flat. Small is the range a tuner is used in. */
  it('follows a change too small to argue about', () => {
    const settled = feed(held(0))

    expect(off(feed(held(2), settled).hz as number)).toBeCloseTo(2, 1)
  })

  it('follows a peg turned under it', () => {
    const settled = feed(held(0))
    const wound = feed(
      Array.from({ length: DEFAULT_NEEDLE.readings }, (_, step) => clear(step * 3)),
      settled
    )

    expect(off(wound.hz as number)).toBeGreaterThan(10)
  })
})

describe('a reading not worth having', () => {
  it('is ignored when the window was not periodic enough', () => {
    const settled = feed(held(0))
    const muddled = feed([{ frequency: at(300), clarity: 0.4, level: 0.02 }], settled)

    expect(muddled.hz).toBe(settled.hz)
  })

  it('is ignored when there was no pitch at all', () => {
    const settled = feed(held(0))
    const silent = feed([{ frequency: null, clarity: 0, level: 0.0001 }], settled)

    expect(silent.hz).toBe(settled.hz)
  })

  it('is outvoted when it is a single wild one', () => {
    const settled = feed(held(0))
    const stray = feed([clear(400), ...held(0, 2)], settled)

    expect(off(stray.hz as number)).toBeCloseTo(0, 1)
  })

  /* Six strings at once are not periodic and are refused outright, but the odd
     window of a chord comes out looking convincing and reads nothing that is
     on the guitar. Asking for more confidence is what rules those out — at the
     cost of naming a string you have just played a little later. */
  it('is ruled out by confidence when a chord almost passes for a note', () => {
    const strict = { ...DEFAULT_NEEDLE, clarity: 0.95 }
    const settled = feed(held(0), newNeedle(), strict)
    const chord = feed(
      Array.from({ length: 8 }, () => ({ frequency: at(-165), clarity: 0.91, level: 0.05 })),
      settled,
      strict
    )

    expect(chord.hz).toBe(settled.hz)
  })
})

/**
 * A plucked string is sharp when struck — ten cents on a low E — and settles
 * as it fades. The needle shows that rather than waiting it out, which is the
 * trade that was chosen: being told what you played straight away is worth
 * more than being told a truer number a second and a half later.
 */
describe('the attack of a pluck', () => {
  const pluck = (settlesOn: number) =>
    Array.from({ length: 40 }, (_, step) => ({
      frequency: at(settlesOn + 11 * Math.exp(-step / 7)),
      clarity: 1,
      level: 0.06 * Math.exp(-step / 9)
    }))

  it('is answered rather than waited out', () => {
    expect(feed(pluck(0).slice(0, 3)).hz).not.toBeNull()
  })

  it('gives way to the pitch the string settles on', () => {
    expect(off(feed(pluck(0)).hz as number)).toBeCloseTo(0, 0)
  })
})

describe('how much it smooths', () => {
  it('shows every reading when asked for none', () => {
    const twitchy = { ...DEFAULT_NEEDLE, readings: 1 }
    const settled = feed(held(0), newNeedle(), twitchy)

    expect(off(feed([clear(30)], settled, twitchy).hz as number)).toBeCloseTo(30, 1)
  })

  it('outvotes more of them when asked for more', () => {
    const steady = { ...DEFAULT_NEEDLE, readings: 15 }
    const settled = feed(held(0, 15), newNeedle(), steady)
    const nudged = feed(Array.from({ length: 7 }, () => clear(30)), settled, steady)

    expect(off(nudged.hz as number)).toBeCloseTo(0, 1)
  })
})
