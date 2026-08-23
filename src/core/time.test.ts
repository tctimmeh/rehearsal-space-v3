import { describe, expect, it } from 'vitest'

import { formatClock, formatRemaining } from './time'

describe('formatClock', () => {
  it('pads minutes and seconds', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(84)).toBe('01:24')
    expect(formatClock(3599)).toBe('59:59')
  })

  it('signs count-in time before the song starts', () => {
    expect(formatClock(-4)).toBe('-00:04')
    expect(formatClock(-64)).toBe('-01:04')
  })

  it('truncates rather than rounds, so 00:01 does not appear before a second has passed', () => {
    expect(formatClock(0.99)).toBe('00:00')
    expect(formatClock(-0.99)).toBe('-00:00')
  })
})

describe('formatRemaining', () => {
  it('counts down to the end of the song', () => {
    expect(formatRemaining(84, 240)).toBe('-02:36')
  })

  it('clamps at the end rather than going positive', () => {
    expect(formatRemaining(250, 240)).toBe('-00:00')
  })
})
