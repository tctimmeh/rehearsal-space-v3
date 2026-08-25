import { describe, expect, it } from 'vitest'

import {
  beatDuration,
  beatOfMeasure,
  clampBeats,
  countAfterChange,
  pulsesBetween
} from './pulse'

describe('beatDuration', () => {
  it('is half a second at 120', () => {
    expect(beatDuration(120)).toBe(0.5)
  })

  it('refuses a tempo that would be a drone or a blur', () => {
    expect(beatDuration(0)).toBe(beatDuration(20))
    expect(beatDuration(10000)).toBe(beatDuration(400))
  })
})

describe('pulsesBetween', () => {
  it('starts on the beat the metronome was started', () => {
    const [first] = pulsesBetween(120, 4, 0, 0.1)
    expect(first).toEqual({ index: 0, at: 0, accent: true })
  })

  it('hands back only the window asked for', () => {
    const window = pulsesBetween(120, 4, 1, 2)
    expect(window.map((pulse) => pulse.at)).toEqual([1, 1.5])
  })

  it('never repeats a beat across neighbouring windows', () => {
    const first = pulsesBetween(120, 4, 0, 1)
    const second = pulsesBetween(120, 4, 1, 2)
    const overlap = first.filter((pulse) => second.some((other) => other.index === pulse.index))
    expect(overlap).toEqual([])
  })

  it('accents the first beat of each measure and nothing else', () => {
    const bars = pulsesBetween(120, 4, 0, 4)
    expect(bars.map((pulse) => pulse.at)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5])
    expect(bars.filter((pulse) => pulse.accent).map((pulse) => pulse.index)).toEqual([0, 4])
  })

  it('accents every beat when the measure is one beat long', () => {
    expect(pulsesBetween(120, 1, 0, 1).every((pulse) => pulse.accent)).toBe(true)
  })

  it('is empty for a window that has already gone by', () => {
    expect(pulsesBetween(120, 4, 2, 1)).toEqual([])
  })

  it('does not go back before it started', () => {
    expect(pulsesBetween(120, 4, -1, 0.6).map((pulse) => pulse.index)).toEqual([0, 1])
  })
})

describe('clampBeats', () => {
  it('keeps a measure to something countable', () => {
    expect(clampBeats(0)).toBe(1)
    expect(clampBeats(99)).toBe(16)
    expect(clampBeats(3.4)).toBe(3)
  })
})

describe('beatOfMeasure', () => {
  it('counts from one, the way a musician does', () => {
    expect([0, 1, 2, 3, 4].map((index) => beatOfMeasure(index, 4))).toEqual([1, 2, 3, 4, 1])
  })
})

/**
 * Nudging the tempo used to send the count back to beat one, which is exactly
 * what you do not want from something you are playing along to.
 */
describe('countAfterChange', () => {
  it('carries the count on through a tempo change', () => {
    expect(countAfterChange(8, 3, false)).toBe(11)
  })

  it('starts a new measure when the measure itself changes length', () => {
    expect(countAfterChange(8, 3, true)).toBe(0)
  })

  it('keeps the accent where the count says, not where the change happened', () => {
    const beatsBefore = countAfterChange(6, 2, false)
    /* Beat 8 of a four-beat measure is a downbeat, whenever the tempo moved. */
    expect(beatOfMeasure(beatsBefore, 4)).toBe(1)
  })
})
