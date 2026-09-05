import { describe, expect, it } from 'vitest'

import {
  ENGAGED_COLORS,
  ENGAGED_COLOR_DEFAULT,
  engagedTheme,
  engagedThemeOf,
  isEngagedColorId
} from './accents'

describe('lighting a latched control', () => {
  it('keeps the hue itself for the glyph', () => {
    expect(engagedTheme('#5ee0d5').color).toBe('#5ee0d5')
  })

  /* A rim as bright as the glow reads as a second glow, and one left at the
     button's own near-black reads as the hue not having been applied. */
  it('takes the hue most of the way down to the button edge for the rim', () => {
    expect(engagedTheme('#5ee0d5').rim).toBe('#214342')
    expect(engagedTheme('#ffd166').rim).toBe('#4a3f25')
  })

  it('glows in the hue, over the well the control already sits in', () => {
    const { glow } = engagedTheme('#7cc7ff')

    expect(glow).toContain('inset 0 2px 4px rgba(0, 0, 0, 0.75)')
    expect(glow).toContain('rgba(124, 199, 255, 0.32)')
  })

  it('pads a channel that is one digit rather than writing a five-digit colour', () => {
    expect(engagedTheme('#0e0f10').rim).toHaveLength(7)
  })

  it('answers for every colour offered, and falls back rather than throwing', () => {
    for (const one of ENGAGED_COLORS) {
      expect(engagedThemeOf(one.id).color).toBe(one.hex)
    }
    expect(engagedThemeOf('nonsense' as never)).toEqual(engagedTheme(ENGAGED_COLORS[0].hex))
  })

  it('knows what it offers from what it does not', () => {
    expect(isEngagedColorId(ENGAGED_COLOR_DEFAULT)).toBe(true)
    expect(isEngagedColorId('chartreuse')).toBe(false)
    expect(isEngagedColorId(null)).toBe(false)
  })
})
