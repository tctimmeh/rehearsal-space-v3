import { describe, expect, it } from 'vitest'

import { collectTap, tempoFromTaps, TAP_TIMEOUT_S } from './tap'

const tapped = (...gaps: number[]): number[] => {
  let at = 10
  return gaps.reduce((taps, gap) => collectTap(taps, (at += gap)), collectTap([], at))
}

describe('collectTap', () => {
  it('begins a count with the first tap', () => {
    expect(collectTap([], 4)).toEqual([4])
  })

  it('adds to a count that is under way', () => {
    expect(collectTap([1, 1.5], 2)).toEqual([1, 1.5, 2])
  })

  it('starts again after a pause too long to be a beat', () => {
    expect(collectTap([1, 1.5], 1.5 + TAP_TIMEOUT_S + 0.1)).toEqual([1.5 + TAP_TIMEOUT_S + 0.1])
  })

  it('keeps a slow tempo together rather than treating it as a fresh start', () => {
    /* 20 bpm is three seconds a beat, and still one tempo. */
    expect(collectTap([1], 4)).toEqual([1, 4])
  })

  it('remembers only the recent past, so a change of mind is followed', () => {
    const many = Array.from({ length: 12 }, (_, index) => index * 0.5)
    const taps = many.reduce<number[]>((collected, at) => collectTap(collected, at), [])
    expect(taps).toHaveLength(6)
    expect(taps.at(-1)).toBe(5.5)
  })
})

describe('tempoFromTaps', () => {
  it('says nothing from a single tap', () => {
    expect(tempoFromTaps([2])).toBeNull()
    expect(tempoFromTaps([])).toBeNull()
  })

  it('reads a tempo from two taps', () => {
    expect(tempoFromTaps([0, 0.5])).toBe(120)
  })

  it('averages out an unsteady hand', () => {
    expect(tempoFromTaps(tapped(0.52, 0.48, 0.51, 0.49))).toBe(120)
  })

  it('ignores one fumbled tap instead of being dragged by it', () => {
    /* Four beats of 100 bpm with one tap landing early. */
    expect(tempoFromTaps(tapped(0.6, 0.6, 0.2, 0.6, 0.6))).toBe(100)
  })

  it('rounds to a tempo somebody can read', () => {
    expect(Number.isInteger(tempoFromTaps([0, 0.44]) as number)).toBe(true)
  })

  it('refuses a tempo that would be a drone or a blur', () => {
    expect(tempoFromTaps([0, 10])).toBe(20)
    expect(tempoFromTaps([0, 0.02])).toBe(400)
  })
})
