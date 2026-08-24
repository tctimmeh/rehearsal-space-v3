import { describe, expect, it } from 'vitest'

import { clampViewCentre } from './viewWindow'

/** Twenty seconds of song, four seconds of it visible. */
const song: [number, number] = [0, 20]

describe('clampViewCentre', () => {
  it('leaves a view over the middle of the song alone', () => {
    expect(clampViewCentre(10, 4, song)).toBe(10)
  })

  it('stops short of running off the beginning', () => {
    const centre = clampViewCentre(-50, 4, song)
    /* A second of air before the song starts, and no more. */
    expect(centre - 2).toBeCloseTo(-1, 10)
  })

  it('stops short of running off the end', () => {
    const centre = clampViewCentre(500, 4, song)
    expect(centre + 2).toBeCloseTo(21, 10)
  })

  it('lets a count-in before zero be reached', () => {
    const centre = clampViewCentre(-50, 4, [-4, 20])
    expect(centre - 2).toBeCloseTo(-5, 10)
  })

  it('centres on the song when the view is wider than it is', () => {
    /* Nothing to scroll through: three minutes of window over twenty seconds. */
    expect(clampViewCentre(1000, 180, song)).toBe(10)
    expect(clampViewCentre(-1000, 180, song)).toBe(10)
  })

  it('never leaves more air than half the window', () => {
    /* At a quarter-second zoom, a second of air would be four screens of it. */
    const centre = clampViewCentre(-50, 0.25, song)
    expect(centre).toBeCloseTo(0, 10)
  })

  it('copes with a song of no length at all', () => {
    expect(clampViewCentre(50, 4, [0, 0])).toBe(0)
  })
})
