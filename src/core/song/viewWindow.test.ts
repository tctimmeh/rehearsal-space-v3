import { describe, expect, it } from 'vitest'

import { centreToShow, clampViewCentre } from './viewWindow'

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

  /* What the click align asks for: a count-in is aimed at from behind it, and
     a view that stops a second short of the song leaves nowhere to stand. */
  it('gives half a window at each end when that is what is asked for', () => {
    const left = clampViewCentre(-50, 4, song, 2)
    const right = clampViewCentre(50, 4, song, 2)

    expect(left - 2).toBeCloseTo(-2, 10)
    expect(right + 2).toBeCloseTo(22, 10)
  })

  /* Otherwise the whole-song view would sit the song in half the strip with
     an empty half beside it. */
  it('still centres a song narrower than the window, however much air is asked', () => {
    expect(clampViewCentre(0, 30, song, 15)).toBe(10)
    expect(clampViewCentre(0, 20, song, 10)).toBe(10)
  })
})

describe('following something being dragged', () => {
  /* Four seconds across the window, centred on ten: 8 to 12 on screen. */
  const span = 4

  it('does not move while the moment is on screen', () => {
    expect(centreToShow(10, 10, span)).toBe(10)
    expect(centreToShow(8.9, 10, span)).toBe(10)
    expect(centreToShow(11.1, 10, span)).toBe(10)
  })

  /* Taking hold of a marker that is already near an edge must not haul the
     view over to it, and nor must nudging one inward from there. */
  it('does not move for a moment sitting right against an edge', () => {
    expect(centreToShow(8.01, 10, span)).toBe(10)
    expect(centreToShow(8, 10, span)).toBe(10)
    expect(centreToShow(11.99, 10, span)).toBe(10)
  })

  /* The whole complaint: dragging one end of a click track towards the music
     must leave the music where it is, however much empty space is behind. */
  it('gives no ground at all for a moment coming back into the middle', () => {
    for (const at of [9, 9.5, 10, 10.5, 11]) {
      expect(centreToShow(at, 10, span)).toBe(10)
    }
  })

  it('follows a moment off the left, holding it just inside the edge', () => {
    const centre = centreToShow(7, 10, span)

    expect(centre - span / 2).toBeCloseTo(7 - span * 0.02, 10)
    /* And having brought it back, it stops: no second nudge for the same. */
    expect(centreToShow(7, centre, span)).toBe(centre)
  })

  it('follows a moment off the right the same way', () => {
    const centre = centreToShow(13, 10, span)

    expect(centre + span / 2).toBeCloseTo(13 + span * 0.02, 10)
    expect(centreToShow(13, centre, span)).toBe(centre)
  })

  /* Dragging fast enough to leave the window between two moves still lands
     the handle at the edge rather than half a screen past it. */
  it('catches up in one move however far the moment has gone', () => {
    const centre = centreToShow(-40, 10, span)

    expect(centre - span / 2).toBeCloseTo(-40 - span * 0.02, 10)
  })

  /* The same fraction of the window either way, so a marker pushed off the
     edge comes back the same distance whether the view is three minutes
     across or a fifth of a second. */
  it('keeps the room it leaves in proportion to the window', () => {
    const insideOf = (time: number, centre: number, width: number) =>
      time - (centreToShow(time, centre, width) - width / 2)

    expect(insideOf(-1, 100, 200)).toBeCloseTo(200 * 0.02, 10)
    expect(insideOf(99.89, 100, 0.2)).toBeCloseTo(0.2 * 0.02, 10)
  })
})
